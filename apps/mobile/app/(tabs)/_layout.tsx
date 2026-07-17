// ============================================================
// VARS — Bottom Tab Navigator
// Tabs: Discover, Bookings, Alerts, Profile
// ============================================================
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { SearchIcon, CalendarIcon, BellIcon, PersonIcon } from '@/components/icons';

export default function TabLayout() {
  const { theme } = useVarsTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.ink,
        tabBarInactiveTintColor: theme.color.inkMuted,
        tabBarStyle: {
          backgroundColor: theme.color.bg,
          borderTopColor: theme.color.inkFaint,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarLabel: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <SearchIcon size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarLabel: 'Bookings',
          tabBarIcon: ({ color, size }) => (
            <CalendarIcon size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <BellIcon size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <PersonIcon size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
