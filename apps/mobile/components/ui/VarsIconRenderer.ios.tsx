import React from 'react';
import { SymbolView } from 'expo-symbols';
import { iconSystemNames, SvgIconByName, VarsIconName } from './iconMap';

// iOS renderer: SF Symbols via expo-symbols, with the existing SVG set as the
// fallback prop (rendered by expo-symbols itself if the symbol name is ever
// unavailable on the running OS version).
export function VarsIconRenderer({
  name,
  size,
  color,
}: {
  name: VarsIconName;
  size: number;
  color: string;
}) {
  const Icon = SvgIconByName[name];
  return (
    <SymbolView
      name={iconSystemNames[name].ios}
      size={size}
      tintColor={color}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      fallback={<Icon size={size} color={color} />}
    />
  );
}
