// ============================================================
// Phase 0 checkpoint screen. Not linked from any tab or menu —
// reached only by direct navigation during founder review.
// Renders all eleven catalogue primitives in both appearances.
// Delete before Phase 1 work lands.
// ============================================================
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  VarsButton,
  VarsCheckbox,
  VarsDialog,
  VarsIcon,
  VarsIconName,
  VarsInput,
  VarsSegmentedControl,
  VarsSkeleton,
  VarsSurface,
  VarsSwitch,
  VarsTabItem,
  VarsToast,
  iconSystemNames,
} from '@/components/ui';
import { varsThemeFor, VarsAppearance, VarsElevation } from '@/constants/visualSystem';

const ELEVATIONS: VarsElevation[] = [0, 1, 2, 3, 4];
const SAMPLE_ICON_NAMES = Object.keys(iconSystemNames) as VarsIconName[];

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ReturnType<typeof varsThemeFor>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.color.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function VisualPreviewScreen() {
  const [appearance, setAppearance] = useState<VarsAppearance>('light');
  const [checked, setChecked] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [segment, setSegment] = useState<'week' | 'month'>('week');
  const [dialogVisible, setDialogVisible] = useState(false);
  const theme = varsThemeFor(appearance);

  return (
    <ScrollView
      style={{ backgroundColor: theme.color.bg }}
      contentContainerStyle={styles.content}
    >
      <VarsButton
        label={appearance === 'light' ? 'Switch to dark' : 'Switch to light'}
        onPress={() => setAppearance(appearance === 'light' ? 'dark' : 'light')}
        theme={theme}
        variant="secondary"
        size="md"
      />

      <Section title="VarsSurface (elevation 0-4)" theme={theme}>
        <View style={styles.row}>
          {ELEVATIONS.map((elevation) => (
            <VarsSurface key={elevation} theme={theme} elevation={elevation} style={styles.elevationBox}>
              <Text style={{ color: theme.color.ink }}>{elevation}</Text>
            </VarsSurface>
          ))}
        </View>
      </Section>

      <Section title="VarsButton" theme={theme}>
        <View style={styles.stack}>
          <VarsButton label="Primary lg" onPress={() => {}} theme={theme} variant="primary" size="lg" />
          <VarsButton label="Secondary md" onPress={() => {}} theme={theme} variant="secondary" size="md" />
          <VarsButton label="Ghost sm" onPress={() => {}} theme={theme} variant="ghost" size="sm" />
          <VarsButton label="Disabled" onPress={() => {}} theme={theme} disabled />
          <VarsButton label="Loading" onPress={() => {}} theme={theme} loading />
          <VarsButton label="With icon" onPress={() => {}} theme={theme} icon="check" />
        </View>
      </Section>

      <Section title="VarsInput" theme={theme}>
        <View style={styles.stack}>
          <VarsInput theme={theme} label="Default" placeholder="Type here" />
          <VarsInput theme={theme} label="Error" placeholder="Type here" error="This field is required" />
        </View>
      </Section>

      <Section title="VarsCheckbox" theme={theme}>
        <VarsCheckbox checked={checked} onChange={setChecked} label="I agree to the terms" theme={theme} />
      </Section>

      <Section title="VarsSwitch" theme={theme}>
        <VarsSwitch value={switchOn} onChange={setSwitchOn} label="Online" theme={theme} />
      </Section>

      <Section title="VarsSegmentedControl" theme={theme}>
        <VarsSegmentedControl
          value={segment}
          onChange={setSegment}
          theme={theme}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
          ]}
        />
      </Section>

      <Section title="VarsTabItem" theme={theme}>
        <View style={styles.row}>
          <VarsTabItem focused icon="briefcase" label="Jobs" theme={theme} />
          <VarsTabItem focused={false} icon="calendar" label="Schedule" theme={theme} />
          <VarsTabItem focused={false} icon="banknote" label="Earnings" theme={theme} />
        </View>
      </Section>

      <Section title="VarsSkeleton" theme={theme}>
        <View style={styles.stack}>
          <VarsSkeleton theme={theme} height={16} width="60%" />
          <VarsSkeleton theme={theme} height={80} />
        </View>
      </Section>

      <Section title="VarsToast" theme={theme}>
        <View style={styles.stack}>
          <VarsToast message="Slot updated" theme={theme} />
          <VarsToast message="Slot removed" actionLabel="Undo" onAction={() => {}} theme={theme} tone="warning" />
        </View>
      </Section>

      <Section title="VarsDialog" theme={theme}>
        <VarsButton label="Open dialog" onPress={() => setDialogVisible(true)} theme={theme} variant="secondary" />
        <VarsDialog
          visible={dialogVisible}
          title="Cancel booking?"
          body="This cannot be undone."
          confirmLabel="Cancel booking"
          onConfirm={() => setDialogVisible(false)}
          onDismiss={() => setDialogVisible(false)}
          theme={theme}
          tone="danger"
        />
      </Section>

      <Section title="VarsIcon (all names, including add -> plus)" theme={theme}>
        <View style={styles.iconGrid}>
          {SAMPLE_ICON_NAMES.map((name) => (
            <View key={name} style={styles.iconCell}>
              <VarsIcon name={name} size={20} theme={theme} />
              <Text style={[styles.iconLabel, { color: theme.color.inkMuted }]} numberOfLines={1}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 24,
    paddingBottom: 80,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  stack: {
    gap: 12,
  },
  elevationBox: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  iconCell: {
    width: 72,
    alignItems: 'center',
    gap: 4,
  },
  iconLabel: {
    fontSize: 10,
  },
});
