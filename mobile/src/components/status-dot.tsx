import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { TopicStatus } from '@/lib/api';

type Props = { status: TopicStatus | null; size?: number };

export function StatusDot({ status, size = 8 }: Props) {
  const theme = useTheme();

  const color = status === 'exploring'  ? theme.statusExploring
              : status === 'developing' ? theme.statusDeveloping
              : status === 'solid'      ? theme.statusSolid
              : status === 'mastered'   ? theme.statusMastered
              : theme.border;

  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { flexShrink: 0 },
});
