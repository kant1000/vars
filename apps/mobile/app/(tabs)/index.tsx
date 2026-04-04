// Home screen placeholder — full implementation in Phase 5
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>VARS</Text>
      <Text style={styles.sub}>Home screen — Phase 5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  wordmark: { fontSize: 40, fontWeight: '800', color: Colors.primary, letterSpacing: -1 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginTop: 8 },
});
