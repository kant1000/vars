// ============================================================
// VARS — LocationPicker
// A collapsed "📍 {address}" row that only reveals the actual
// picking journey (GPS button + native area picker) when tapped
// — never shown expanded in-page. The area list renders via the
// platform's native <Picker> (wheel on iOS, dialog on Android),
// not a hand-rolled list, so each platform gets its native feel.
// Used on the Discover tab's confirmed-location bar and the
// booking flow's Location step, so this only lives in one place.
// ============================================================
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { VarsButton } from '@/components/ui';
import { VarsTheme } from '@/constants/visualSystem';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { LAGOS_AREAS } from '@/constants/areas';
import { PinIcon, ChevronDownIcon } from '@/components/icons';

export interface ResolvedLocation {
  lat: number;
  lng: number;
  address: string;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
  return [geo?.name, geo?.street, geo?.city ?? geo?.region].filter(Boolean).join(', ');
}

export function LocationPicker({
  theme,
  value,
  onConfirm,
  placeholder = 'Set your location',
  sheetTitle = 'Where should we look?',
  sheetSubtitle,
}: {
  theme: VarsTheme;
  value: ResolvedLocation | null;
  onConfirm: (loc: ResolvedLocation) => void;
  placeholder?: string;
  sheetTitle?: string;
  sheetSubtitle?: string;
}) {
  const s = useMemoStyles(theme);
  const sheetRef = useRef<BottomSheetModal>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState(LAGOS_AREAS[0].name);

  const useCurrentLocation = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location access denied — choose an area below instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      onConfirm({ lat: pos.coords.latitude, lng: pos.coords.longitude, address });
      sheetRef.current?.dismiss();
    } catch {
      setError('Could not get your location — choose an area below instead.');
    } finally {
      setLocating(false);
    }
  }, [onConfirm]);

  const confirmArea = useCallback(() => {
    const area = LAGOS_AREAS.find((a) => a.name === selectedArea);
    if (!area) return;
    onConfirm({ lat: area.lat, lng: area.lng, address: area.name });
    sheetRef.current?.dismiss();
  }, [selectedArea, onConfirm]);

  const displayAddress = useMemo(() => value?.address || placeholder, [value, placeholder]);

  return (
    <>
      <TouchableOpacity
        style={s.row}
        onPress={() => sheetRef.current?.present()}
        activeOpacity={0.7}
      >
        <PinIcon size={18} color={theme.color.ink} />
        <Text style={s.rowText} numberOfLines={1}>{displayAddress}</Text>
        <ChevronDownIcon size={18} color={theme.color.inkMuted} />
      </TouchableOpacity>

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['55%']}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: theme.color.bg }}
        handleIndicatorStyle={{ backgroundColor: theme.color.inkFaint }}
      >
        <BottomSheetView style={s.sheetContent}>
          <Text style={s.sheetTitle}>{sheetTitle}</Text>
          {sheetSubtitle && <Text style={s.sheetSubtitle}>{sheetSubtitle}</Text>}

          <VarsButton
            theme={theme}
            variant="secondary"
            icon="pin"
            label={locating ? 'Locating…' : 'Use current location'}
            onPress={useCurrentLocation}
            loading={locating}
          />

          <Text style={s.orLabel}>or choose an area</Text>

          <View style={s.pickerWrap}>
            <Picker
              selectedValue={selectedArea}
              onValueChange={(v) => setSelectedArea(String(v))}
              itemStyle={{ color: theme.color.ink }}
              dropdownIconColor={theme.color.ink}
            >
              {LAGOS_AREAS.map((area) => (
                <Picker.Item key={area.name} label={area.name} value={area.name} color={theme.color.ink} />
              ))}
            </Picker>
          </View>

          <VarsButton theme={theme} label="Confirm area" onPress={confirmArea} />

          {error && <Text style={s.errorText}>{error}</Text>}
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}

function useMemoStyles(theme: VarsTheme) {
  return React.useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      minHeight: 54, paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      backgroundColor: theme.color.surface2,
    },
    rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.color.ink },
    sheetContent: { padding: 20, gap: 12, paddingBottom: 40 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.color.ink },
    sheetSubtitle: { fontSize: 13, color: theme.color.inkMuted, marginTop: -8 },
    orLabel: { fontSize: 12, fontWeight: '700', color: theme.color.inkMuted, textAlign: 'center' },
    pickerWrap: {
      borderRadius: 5, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      overflow: 'hidden',
    },
    errorText: { fontSize: 12, color: theme.color.accentRed, fontWeight: '500' },
  }), [theme]);
}
