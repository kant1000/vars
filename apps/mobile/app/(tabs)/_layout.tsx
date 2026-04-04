// ============================================================
// VARS — Bottom Tab Navigator (Phase 5)
// Tabs: Discover, Bookings, Alerts, Profile
// ============================================================
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Colors } from '@/constants/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopColor: Colors.border,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Discover', tabBarLabel: 'Discover' }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'Bookings', tabBarLabel: 'Bookings' }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Alerts', tabBarLabel: 'Alerts' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarLabel: 'Profile' }}
      />
    </Tabs>
  );
}
