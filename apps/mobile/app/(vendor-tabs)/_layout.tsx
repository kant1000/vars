// ============================================================
// VARS — Vendor Tab Navigator (Phase 9)
// Tabs: Jobs | Schedule | Earnings | Profile
// ============================================================
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BriefcaseIcon, CalendarIcon, BanknoteIcon, PersonIcon } from '@/components/icons';
import { VendorOnlineProvider } from '@/contexts/VendorOnlineContext';

export default function VendorTabLayout() {
  const { theme } = useVarsTheme();

  return (
    <VendorOnlineProvider>
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
      <Tabs.Screen name="index"    options={{ title: 'Jobs',     tabBarLabel: 'Jobs',     tabBarIcon: ({ color, size }) => <BriefcaseIcon size={size} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarLabel: 'Schedule', tabBarIcon: ({ color, size }) => <CalendarIcon  size={size} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarLabel: 'Earnings', tabBarIcon: ({ color, size }) => <BanknoteIcon  size={size} color={color} /> }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile',  tabBarLabel: 'Profile',  tabBarIcon: ({ color, size }) => <PersonIcon    size={size} color={color} /> }} />
      <Tabs.Screen name="settings"      options={{ href: null }} />
      <Tabs.Screen name="terms"        options={{ href: null }} />
      <Tabs.Screen name="privacy"      options={{ href: null }} />
      <Tabs.Screen name="customer-care" options={{ href: null }} />
    </Tabs>
    </VendorOnlineProvider>
  );
}
