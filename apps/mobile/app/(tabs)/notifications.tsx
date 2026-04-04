// Notifications screen placeholder — full implementation in Phase 10
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.sub}>Phase 10</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 15, color: Colors.textSecondary, marginTop: 8 },
});
