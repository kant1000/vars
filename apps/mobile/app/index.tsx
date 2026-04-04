// Entry point — immediately redirects.
// Actual routing logic is in _layout.tsx.
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)" />;
}
