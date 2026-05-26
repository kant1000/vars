// Entry point — routing handled entirely by _layout.tsx
// When EXPO_PUBLIC_VENDOR_TEST_MODE=true, renders the dev split screen instead.
import { DevModeSplitScreen } from '@/components/DevModeSplitScreen';

const VENDOR_TEST_MODE = process.env.EXPO_PUBLIC_VENDOR_TEST_MODE === 'true';

export default function Index() {
  if (VENDOR_TEST_MODE) {
    return <DevModeSplitScreen />;
  }
  return null;
}
