import { Tabs } from 'expo-router';
import { BookOpen, Sun, User } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

function TabIcon({ Icon, color }: { Icon: React.ElementType; color: ColorValue }) {
  return <Icon size={22} color={color} strokeWidth={1.75} />;
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          borderTopWidth: 1,
        },
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.text, fontFamily: 'Fraunces-Regular', fontSize: 18 },
        headerShadowVisible: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <TabIcon Icon={Sun} color={color} />,
        }}
      />
      <Tabs.Screen
        name="topics"
        options={{
          title: 'Topics',
          tabBarIcon: ({ color }) => <TabIcon Icon={BookOpen} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon Icon={User} color={color} />,
        }}
      />
    </Tabs>
  );
}
