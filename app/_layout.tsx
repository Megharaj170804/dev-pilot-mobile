import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppSplashScreen } from '../src/components/AppSplashScreen';
import { CommandPaletteModal } from '../src/components/CommandPaletteModal';
import { ToastBanner } from '../src/components/ui';
import { AppProvider, useApp } from '../src/context/AppContext';

function RootNavigator() {
  const { dbReady, palette, themeMode } = useApp();
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);

  if (!dbReady || (!fontsLoaded && !fontError)) {
    return (
      <>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <AppSplashScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="pr-comments" />
        <Stack.Screen name="kpi-comments" />
        <Stack.Screen name="eod-updates" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="about" />
      </Stack>
      <CommandPaletteModal />
      <ToastBanner />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
