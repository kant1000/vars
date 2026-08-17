// ============================================================
// VARS — Bottom Tab Navigator
// Tabs: Discover, Bookings, Alerts, Profile
// ============================================================
import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { SearchIcon, CalendarIcon, BellIcon, PersonIcon } from '@/components/icons';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';

export default function TabLayout() {
  const { theme } = useVarsTheme();
  const hasUnread = useUnreadNotifications();

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
            <View>
              <BellIcon size={size} color={color} />
              {hasUnread && <View style={[styles.unreadDot, { backgroundColor: theme.color.accentBlue }]} />}
            </View>
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

const styles = StyleSheet.create({
  unreadDot: {
    position: 'absolute', top: -1, right: -3,
    width: 8, height: 8, borderRadius: 4,
  },
});
