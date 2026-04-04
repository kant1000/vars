// Vendor profile/settings placeholder — full implementation in Phase 12
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';

export default function VendorProfileScreen() {
  const { profile } = useAuth();
  return (
    <View style={s.container}>
      <Text style={s.title}>Profile</Text>
      <Text style={s.name}>{profile?.full_name ?? 'Vendor'}</Text>
      <TouchableOpacity style={s.btn} onPress={signOut}>
        <Text style={s.btnText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  name: { fontSize: 16, color: Colors.textSecondary, marginBottom: 32 },
  btn: { paddingVertical: 12, paddingHorizontal: 28, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12 },
  btnText: { fontSize: 15, fontWeight: '600', color: Colors.error },
});
