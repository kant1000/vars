// Profile screen placeholder — full implementation in Phase 12
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';

export default function ProfileScreen() {
  const { profile, isAuthenticated } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      {isAuthenticated ? (
        <>
          <Text style={styles.name}>{profile?.full_name ?? 'User'}</Text>
          <TouchableOpacity style={styles.signOut} onPress={signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.sub}>Not signed in</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  name: { fontSize: 18, color: Colors.textSecondary, marginBottom: 24 },
  sub: { fontSize: 15, color: Colors.textSecondary },
  signOut: { paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12 },
  signOutText: { fontSize: 15, fontWeight: '600', color: Colors.error },
});
