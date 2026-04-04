// ============================================================
// VARS — Vendor Tab Navigator (Phase 9)
// Tabs: Jobs | Schedule | Earnings | Profile
// ============================================================
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Colors } from '@/constants/colors';

export default function VendorTabLayout() {
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
      <Tabs.Screen name="index"    options={{ title: 'Jobs',     tabBarLabel: 'Jobs'     }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarLabel: 'Schedule' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarLabel: 'Earnings' }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile',  tabBarLabel: 'Profile'  }} />
    </Tabs>
  );
}
