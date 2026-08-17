import React from 'react';
import { View, Text } from 'react-native';
import { BORDER_WIDTH } from '@/constants/colors';

export type VendorStatus = 'online' | 'busy' | 'offline';

interface Props {
  status: VendorStatus;
  size?: number;
  bordered?: boolean;
}

export function StatusDot({ status, size = 14, bordered = true }: Props) {
  const bg =
    status === 'online' ? '#22C55E'
    : status === 'busy' ? '#EF4444'
    : '#9CA3AF';

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        borderWidth: bordered ? Math.max(BORDER_WIDTH.regular, size * 0.11) : 0,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {status === 'offline' && (
        <Text
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: size * 0.5,
            lineHeight: size * 0.65,
            fontWeight: '700',
            includeFontPadding: false,
          }}
        >
          ×
        </Text>
      )}
    </View>
  );
}
