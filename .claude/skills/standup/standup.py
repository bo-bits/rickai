#!/usr/bin/env python3
"""Daily orientation snapshot for /standup. Read-only.

Gathers the committed batch (FLOW = priority:Now) with each leaf's PR / CI /
review state, plus inbox / in-dev / epic-rollup counts, and prints a structured
snapshot. The /standup skill narrates it (summary, blockers, suggested sequence).

CONFIG: flags > env vars > the DEFAULTS below (same scheme as sync/reconcile.py).
Auto-detects user- vs org-owned Projects.
"""
import argparse
import json
import os
import re
import subprocess
import sys

DEFAULT_OWNER = os.environ.get("PROJECT_OWNER", "bo-bits")
DEFAULT_NUMBER = int(os.environ.get("PROJECT_NUMBER", "1"))
DEFAULT_REPO = os.environ.get("PROJECT_REPO", "bo-bits/rikai")

BRANCH_RE = re.compile(r"issue-(\d+)")


def gh(args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=True).stdout


def fetch_board(owner, number):
    q = """query($login:String!,$number:Int!,$cursor:String){ repositoryOwner(login:$login){
      ... on ProjectV2Owner { projectV2(number:$number){
        items(first:100,after:$cursor){ pageInfo{hasNextPage endCursor} nodes{
          status:fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue{name} }
          prio:fieldValueByName(name:"Priority"){ ... on ProjectV2ItemFieldSingleSelectValue{name} }
          content{ ... on Issue{ number title state labels(first:20){nodes{name}}
            subIssues(first:50){ totalCount nodes{state} } } } } } } } } }"""
    items, cur = [], None
    while True:
        out = gh(["api", "graphql", "-f", f"query={q}", "-F", f"login={owner}",
                  "-F", f"number={number}", *(["-F", f"cursor={cur}"] if cur else [])])
        owner_node = json.loads(out)["data"]["repositoryOwner"]
        if owner_node is None:
            sys.exit(f"Owner '{owner}' not found. Check --owner / PROJECT_OWNER.")
        proj = owner_node.get("projectV2")
        if proj is None:
            sys.exit(f"Project #{number} not found for owner '{owner}'. "
                     f"Check --number / PROJECT_NUMBER.")
        d = proj["items"]
        for n in d["nodes"]:
            c = n.get("content") or {}
            if not c.get("number") or c.get("state") != "OPEN":
                continue
            labs = [l["name"] for l in (c.get("labels") or {}).get("nodes", [])]
            subs = c.get("subIssues") or {}
            items.append({
                "number": c["number"], "title": c["title"],
                "status": (n.get("status") or {}).get("name"),
                "prio": (n.get("prio") or {}).get("name"),
                "epic": "epic" in labs,
                "subs_total": subs.get("totalCount", 0),
                "subs_closed": sum(1 for s in subs.get("nodes", []) if s["state"] == "CLOSED"),
            })
        if not d["pageInfo"]["hasNextPage"]:
            break
        cur = d["pageInfo"]["endCursor"]
    return items


def fetch_prs(repo):
    prs = json.loads(gh(["pr", "list", "--repo", repo, "--state", "open", "--limit", "200",
                         "--json", "number,headRefName,isDraft,reviewDecision,statusCheckRollup"]))
    by_issue = {}
    for p in prs:
        m = BRANCH_RE.search(p["headRefName"] or "")
        if not m:
            continue
        concl = [c.get("conclusion") or c.get("state") for c in (p.get("statusCheckRollup") or [])]
        if any(c in ("FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "ERROR") for c in concl):
            ci = "failing"
        elif any(c in ("PENDING", "IN_PROGRESS", "QUEUED", "EXPECTED", None) for c in concl):
            ci = "pending"
        elif concl:
            ci = "passing"
        else:
            ci = "none"
        by_issue[int(m.group(1))] = {"pr": p["number"], "draft": p["isDraft"],
                                     "review": p.get("reviewDecision"), "ci": ci}
    return by_issue


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", default=DEFAULT_OWNER)
    ap.add_argument("--number", type=int, default=DEFAULT_NUMBER)
    ap.add_argument("--repo", default=DEFAULT_REPO)
    args = ap.parse_args()

    items = fetch_board(args.owner, args.number)
    prs = fetch_prs(args.repo)
    now = [i for i in items if i["prio"] == "Now" and not i["epic"]]
    inbox = [i for i in items if not i["prio"] and not i["epic"]]
    in_dev = [i for i in items if i["status"] == "In Dev" and not i["epic"]]
    epics = [i for i in items if i["epic"]]

    def line(i):
        pr = prs.get(i["number"])
        s = f"  #{i['number']} {i['title'][:54]}"
        if pr:
            flags = [f"PR#{pr['pr']}"]
            if pr["ci"] != "none":
                flags.append(f"CI:{pr['ci']}")
            if pr["review"] == "CHANGES_REQUESTED":
                flags.append("changes-requested")
            s += "  [" + " ".join(flags) + "]"
        return s

    print("=== NOW — the committed batch (FLOW) ===")
    any_now = False
    for st in ["In Progress", "Ready", "In Dev", "Todo", None]:
        group = [i for i in now if i["status"] == st]
        if group:
            any_now = True
            print(f"\n{st or 'Todo (no status set)'}:")
            for i in group:
                print(line(i))
    if not any_now:
        print("  (nothing in Now)")

    blockers = []
    for i in now:
        pr = prs.get(i["number"])
        if pr and pr["ci"] == "failing":
            blockers.append(f"  #{i['number']} — CI failing (PR#{pr['pr']})")
        if pr and pr["review"] == "CHANGES_REQUESTED":
            blockers.append(f"  #{i['number']} — changes requested (PR#{pr['pr']})")
    print("\n=== BLOCKERS ===")
    print("\n".join(blockers) if blockers else "  none")

    print("\n=== NEEDS ATTENTION ===")
    print(f"  Inbox (untriaged): {len(inbox)}" + ("  → run /triage" if inbox else ""))
    print(f"  In Dev (awaiting release): {len(in_dev)}" + ("  → /release when ready" if in_dev else ""))

    print("\n=== EPICS (rollup) ===")
    if epics:
        for e in sorted(epics, key=lambda x: -(x["subs_closed"] / x["subs_total"] if x["subs_total"] else 0)):
            t, c = e["subs_total"], e["subs_closed"]
            bar = ("#" * round(10 * c / t)).ljust(10, ".") if t else "----------"
            print(f"  #{e['number']} [{bar}] {c}/{t}  {e['title'][:46]}")
    else:
        print("  none")


if __name__ == "__main__":
    main()
