#!/usr/bin/env python3
"""Reconcile a GitHub Project (v2) board's Status from git/PR reality.

The board is a projection of the repo. This derives the Status of every board
item from the linked PR's state + the issue's open/closed state, and applies the
diff. Pull-based and idempotent: run it anytime, it converges the board to truth.

Status is the ONLY field this touches. Priority (Inbox/Now/Next/Later) and the
`shaped` label are human-owned (see /triage) and are never modified here.

Derivation per board issue (PR<->issue joined by the `issue-<N>` branch name
that /issue creates via `gh issue develop`):

    issue closed                         -> Done
    open PR (head issue-<N>) is draft    -> In Progress
    open PR (head issue-<N>) is ready    -> Ready
    PR merged (head issue-<N>), open     -> In Dev
    no PR                                -> Todo  (left as-is if already Todo)

"Done = issue closed" is exact because /release closes the In-Dev batch when it
ships to the production branch; a manually-closed issue is also terminal, so
closed -> Done holds universally.

CONFIG — set once, three ways (flags > env vars > the DEFAULTS below):
    --owner   / PROJECT_OWNER    GitHub login that owns the Project (user OR org)
    --number  / PROJECT_NUMBER   the Project number (in its URL: /projects/<N>)
    --repo    / PROJECT_REPO     owner/repo the issues + PRs live in

This auto-detects whether the owner is a User or an Organization, so it works
for both personal and org-owned Projects with no extra config.

Usage:
    reconcile.py [--owner OWNER] [--number N] [--repo OWNER/REPO] [--dry-run]
"""
import argparse
import json
import os
import re
import subprocess
import sys

# ---- DEFAULTS: edit these to your project, or pass flags / set env vars -------
DEFAULT_OWNER = os.environ.get("PROJECT_OWNER", "bo-bits")
DEFAULT_NUMBER = int(os.environ.get("PROJECT_NUMBER", "1"))
DEFAULT_REPO = os.environ.get("PROJECT_REPO", "bo-bits/rikai")
# -------------------------------------------------------------------------------

DESIRED_ORDER = ["Todo", "In Progress", "Ready", "In Dev", "Done"]
BRANCH_RE = re.compile(r"issue-(\d+)")


def gh(args, **kw):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=True, **kw).stdout


def fetch_board(owner, number):
    """Return (project_id, status_field_id, {option_name: option_id}, items).

    items: list of {item_id, number, state (issue OPEN/CLOSED), status_name, is_epic}.
    Works for both user- and org-owned Projects via the repositoryOwner interface.
    """
    query = """
    query($login:String!, $number:Int!, $cursor:String){
      repositoryOwner(login:$login){
        ... on ProjectV2Owner {
          projectV2(number:$number){
            id
            field(name:"Status"){ ... on ProjectV2SingleSelectField { id options{ id name } } }
            items(first:100, after:$cursor){
              pageInfo{ hasNextPage endCursor }
              nodes{
                id
                fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } }
                content{ ... on Issue { number state labels(first:20){ nodes{ name } } } }
              }
            }
          }
        }
      }
    }"""
    items, cursor = [], None
    project_id = status_field_id = None
    options = {}
    while True:
        out = gh([
            "api", "graphql", "-f", f"query={query}",
            "-F", f"login={owner}", "-F", f"number={number}",
            *(["-F", f"cursor={cursor}"] if cursor else []),
        ])
        owner_node = json.loads(out)["data"]["repositoryOwner"]
        if owner_node is None:
            sys.exit(f"Owner '{owner}' not found. Check --owner / PROJECT_OWNER.")
        proj = owner_node.get("projectV2")
        if proj is None:
            sys.exit(f"Project #{number} not found for owner '{owner}'. "
                     f"Check --number / PROJECT_NUMBER (it's in the project URL).")
        if project_id is None:
            project_id = proj["id"]
            if not proj.get("field"):
                sys.exit("No 'Status' single-select field on this Project. "
                         "Create it before running /sync (see docs/workflow.md).")
            status_field_id = proj["field"]["id"]
            options = {o["name"]: o["id"] for o in proj["field"]["options"]}
        for n in proj["items"]["nodes"]:
            c = n.get("content") or {}
            if "number" not in c:  # skip PRs/drafts on the board
                continue
            sv = n.get("fieldValueByName") or {}
            labels = [l["name"] for l in (c.get("labels") or {}).get("nodes", [])]
            items.append({
                "item_id": n["id"],
                "number": c["number"],
                "state": c.get("state"),
                "status_name": sv.get("name"),
                "is_epic": "epic" in labels,
            })
        page = proj["items"]["pageInfo"]
        if not page["hasNextPage"]:
            break
        cursor = page["endCursor"]
    return project_id, status_field_id, options, items


def fetch_prs(repo):
    """Map issue number -> best PR signal: ('In Progress'|'Ready'|'In Dev')."""
    open_prs = json.loads(gh([
        "pr", "list", "--repo", repo, "--state", "open", "--limit", "300",
        "--json", "headRefName,isDraft",
    ]))
    merged_prs = json.loads(gh([
        "pr", "list", "--repo", repo, "--state", "merged", "--limit", "300",
        "--json", "headRefName",
    ]))
    signal = {}
    # Merged first (weakest), so an open PR overrides it.
    for pr in merged_prs:
        m = BRANCH_RE.search(pr["headRefName"] or "")
        if m:
            signal[int(m.group(1))] = "In Dev"
    for pr in open_prs:
        m = BRANCH_RE.search(pr["headRefName"] or "")
        if m:
            signal[int(m.group(1))] = "In Progress" if pr["isDraft"] else "Ready"
    return signal


def desired_status(item, pr_signal):
    if item["state"] == "CLOSED":
        return "Done"
    return pr_signal.get(item["number"], "Todo")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", default=DEFAULT_OWNER)
    ap.add_argument("--number", type=int, default=DEFAULT_NUMBER)
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    project_id, status_field_id, options, items = fetch_board(args.owner, args.number)
    missing = [s for s in DESIRED_ORDER if s not in options]
    if missing:
        sys.exit(f"Board is missing Status options {missing}. "
                 f"Reconfigure the board before running /sync. Have: {list(options)}")

    pr_signal = fetch_prs(args.repo)

    changes = []  # (item, desired_status_name)
    clears = []   # epics that wrongly carry a pipeline Status
    for it in items:
        if it["is_epic"]:
            # Epics are context docs, not work items: their progress is the
            # native Sub-issues progress rollup, not the PR pipeline. Never set
            # a Status; clear one if it leaked in.
            if it["status_name"] is not None:
                clears.append(it)
            continue
        want = desired_status(it, pr_signal)
        if want == "Todo" and it["status_name"] in (None, "Todo"):
            continue  # don't churn untouched backlog
        if it["status_name"] != want:
            changes.append((it, want))

    if not changes and not clears:
        print("Board already in sync. No changes.")
        return

    for it, want in changes:
        print(f"  #{it['number']}: {it['status_name'] or '(none)'} -> {want}")
    for it in clears:
        print(f"  #{it['number']} (epic): {it['status_name']} -> (none, tracked by Sub-issues progress)")
    if args.dry_run:
        print(f"\n[dry-run] {len(changes) + len(clears)} change(s) not applied.")
        return

    for it, want in changes:
        gh([
            "project", "item-edit",
            "--project-id", project_id,
            "--id", it["item_id"],
            "--field-id", status_field_id,
            "--single-select-option-id", options[want],
        ])
    for it in clears:
        gh([
            "project", "item-edit", "--clear",
            "--project-id", project_id,
            "--id", it["item_id"],
            "--field-id", status_field_id,
        ])
    print(f"\nApplied {len(changes) + len(clears)} change(s).")


if __name__ == "__main__":
    main()
