import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';

type P = { size?: number; color?: string };

const sw = 1.75;
const base = (size: number, color: string) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none' as const, stroke: color, strokeWidth: sw,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export function CheckIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M20 6L9 17l-5-5" /></Svg>;
}
export function CloseIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Line x1="18" y1="6" x2="6" y2="18" /><Line x1="6" y1="6" x2="18" y2="18" /></Svg>;
}
export function PinIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><Circle cx="12" cy="10" r="3" /></Svg>;
}
export function BellIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path d="M13.73 21a2 2 0 0 1-3.46 0" /></Svg>;
}
export function HeartIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></Svg>;
}
export function EditIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Svg>;
}
export function PenLineIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></Svg>;
}
export function StarFilledIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={color} stroke={color} strokeWidth="1.75" strokeLinejoin="round" /></Svg>;
}
export function StarEmptyIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></Svg>;
}
export function LightningIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></Svg>;
}
export function LockIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><Path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
}
export function CarIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M5 17H3a2 2 0 0 1-2-2V9l3-6h14l3 6v6a2 2 0 0 1-2 2h-2" /><Circle cx="7" cy="17" r="2" /><Circle cx="17" cy="17" r="2" /></Svg>;
}
export function ChevronUpIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M18 15l-6-6-6 6" /></Svg>;
}
export function ChevronDownIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M6 9l6 6 6-6" /></Svg>;
}
export function ChevronRightIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M9 18l6-6-6-6" /></Svg>;
}
export function HourglassIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M5 21v-4a7 7 0 0 1 7-7 7 7 0 0 1 7 7v4" /><Path d="M5 3v4a7 7 0 0 0 7 7 7 7 0 0 0 7-7V3" /><Line x1="5" y1="3" x2="19" y2="3" /><Line x1="5" y1="21" x2="19" y2="21" /></Svg>;
}
export function CheckCircleIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><Polyline points="22 4 12 14.01 9 11.01" /></Svg>;
}
export function XCircleIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Circle cx="12" cy="12" r="10" /><Line x1="15" y1="9" x2="9" y2="15" /><Line x1="9" y1="9" x2="15" y2="15" /></Svg>;
}
export function CreditCardIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><Line x1="1" y1="10" x2="23" y2="10" /></Svg>;
}
export function BanknoteIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Rect x="2" y="6" width="20" height="12" rx="2" /><Circle cx="12" cy="12" r="3" /><Path d="M6 10h.01M18 14h.01" /></Svg>;
}
export function ArrowUpIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Line x1="12" y1="19" x2="12" y2="5" /><Polyline points="5 12 12 5 19 12" /></Svg>;
}
export function StarIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></Svg>;
}
export function WarningIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><Line x1="12" y1="9" x2="12" y2="13" /><Line x1="12" y1="17" x2="12.01" y2="17" /></Svg>;
}
export function ClockIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Circle cx="12" cy="12" r="10" /><Polyline points="12 6 12 12 16 14" /></Svg>;
}
export function EyeIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><Circle cx="12" cy="12" r="3" /></Svg>;
}
export function EyeOffIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><Line x1="1" y1="1" x2="23" y2="23" /></Svg>;
}
export function SparkleIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M12 3v3M12 18v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M3 12h3M18 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" /></Svg>;
}
export function SearchIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Circle cx="11" cy="11" r="8" /><Line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>;
}
export function CalendarIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><Line x1="16" y1="2" x2="16" y2="6" /><Line x1="8" y1="2" x2="8" y2="6" /><Line x1="3" y1="10" x2="21" y2="10" /></Svg>;
}
export function PersonIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" /></Svg>;
}
export function BriefcaseIcon({ size = 16, color = '#1A1A1A' }: P) {
  return <Svg {...base(size, color)}><Rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><Path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><Line x1="12" y1="12" x2="12" y2="12" /><Line x1="12" y1="12" x2="12.01" y2="12" /></Svg>;
}
