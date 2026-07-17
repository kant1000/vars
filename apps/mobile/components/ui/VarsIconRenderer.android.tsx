import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { iconSystemNames, VarsIconName } from './iconMap';

// Android renderer: classic Material Icons font via @expo/vector-icons — the
// package already bundled with this Expo SDK, no version conflict. Material
// Symbols (the variable-weight successor) needs expo-symbols 55+, which needs
// an Expo SDK upgrade this app isn't on; see
// docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md section 3.3.
export function VarsIconRenderer({
  name,
  size,
  color,
}: {
  name: VarsIconName;
  size: number;
  color: string;
}) {
  return (
    <MaterialIcons
      name={iconSystemNames[name].android}
      size={size}
      color={color}
    />
  );
}
