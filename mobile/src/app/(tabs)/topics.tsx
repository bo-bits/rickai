import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { fetchTopics, type Topic } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';

function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet explored';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function TopicRow({ topic }: { topic: Topic }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowLeft}>
        <StatusDot status={topic.status} size={10} />
        <View style={styles.rowText}>
          <ThemedText type="default" style={styles.rowTitle}>{topic.title}</ThemedText>
          <ThemedText type="small" themeColor="textTertiary">{formatDate(topic.last_session_at)}</ThemedText>
        </View>
      </View>
    </View>
  );
}

export default function Topics() {
  const theme = useTheme();
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchTopics()
      .then(setTopics)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = query.trim()
    ? topics.filter(t => t.title.toLowerCase().includes(query.toLowerCase()))
    : topics;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="display">Topics</ThemedText>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: theme.inputFill }]}>
        <TextInput
          style={[styles.search, { color: theme.text }]}
          placeholder="Search topics…"
          placeholderTextColor={theme.textTertiary}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <ThemedText type="small" themeColor="danger">{error}</ThemedText>
        </View>
      )}

      {!loading && !error && filtered.length === 0 && (
        <View style={styles.center}>
          <ThemedText type="small" themeColor="textTertiary">
            {topics.length === 0 ? 'No topics yet.' : 'No matches.'}
          </ThemedText>
        </View>
      )}

      {!loading && !error && filtered.length > 0 && (
        <FlatList
          data={filtered}
          keyExtractor={t => t.topic_slug}
          renderItem={({ item }) => <TopicRow topic={item} />}
          contentContainerStyle={styles.list}
        />
      )}

      <Pressable
        style={({ pressed }) => [
          styles.newButton,
          { backgroundColor: theme.tint, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={() => router.navigate('/')}>
        <ThemedText style={[styles.newButtonText, { color: theme.background }]}>
          + New topic
        </ThemedText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  searchWrap: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  search: {
    fontSize: 16,
    lineHeight: 22,
  },
  list: {
    paddingBottom: 100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flex: 1,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontWeight: '600' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  newButton: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: 14,
    borderRadius: 100,
  },
  newButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
