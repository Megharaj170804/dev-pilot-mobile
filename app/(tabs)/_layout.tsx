import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useApp } from '../../src/context/AppContext';

export default function TabLayout() {
  const { palette } = useApp();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarStyle: {
          backgroundColor: palette.bgElevated,
          borderTopColor: palette.borderSubtle,
        },
        tabBarActiveTintColor: palette.primaryInk,
        tabBarInactiveTintColor: palette.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sync-pr"
        options={{
          title: 'PR Sync',
          tabBarIcon: ({ color, size }) => <Ionicons name="git-pull-request-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quick-task"
        options={{
          title: 'Quick Task',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hierarchy"
        options={{
          title: 'Hierarchy',
          tabBarIcon: ({ color, size }) => <Ionicons name="layers-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Tools',
          tabBarIcon: ({ color, size }) => <Ionicons name="apps-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
