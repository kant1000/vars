import React from 'react';
import { SvgIconByName, VarsIconName } from './iconMap';

// Default/web renderer. Platform-specific native symbol renderers live in
// VarsIconRenderer.ios.tsx and VarsIconRenderer.android.tsx — Metro picks the
// right file per platform automatically, so this file is never bundled on
// native builds and native modules are never bundled on web.
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
  return <Icon size={size} color={color} />;
}
