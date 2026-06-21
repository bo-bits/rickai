// Root layout: providers + the auth gate. A single effect watches the session
// and the current route group, redirecting unauthenticated users to (auth) and
// authenticated users into (tabs). While the persisted session is still loading
// we show a neutral splash so no protected screen flashes first.

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/lib/auth';

function AuthGate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && segments[0] !== '(tabs)') {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors[scheme].background,
        }}>
        <ActivityIndicator color={Colors[scheme].tint} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SessionProvider>
            <AuthGate />
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
