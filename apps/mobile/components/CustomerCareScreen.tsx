// ============================================================
// VARS — Customer Care screen (shared: customer + vendor)
// Bubble grid pulled from constants/customerCareContent.ts, an
// "Ask your AI" handoff sheet (constants/aiPlatforms.ts), and a
// sticky WhatsApp/Email footer. See docs/codex/CLEANUP_ROADMAP.md
// for why this replaced the old per-side "Get help" modal.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { VarsTheme } from '@/constants/visualSystem';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsIcon, VarsButton, VarsToast } from '@/components/ui';
import { SearchIcon } from '@/components/icons';
import { supabase } from '@/lib/supabase';
import { CUSTOMER_CARE_CONTENT, CustomerCareAudience } from '@/constants/customerCareContent';
import { AI_PLATFORMS, AIPlatform } from '@/constants/aiPlatforms';

const WHATSAPP_NUMBER = '447344975063';

const buildTicket = () => `VARS-${Date.now().toString(36).toUpperCase().slice(-8)}`;

function buildAIMessage(persona: CustomerCareAudience, supportEmail: string) {
  return (
    `You are a support assistant for VARS, an on-demand beauty and grooming app in Lagos, Nigeria. ` +
    `VARS connects customers with verified barbers, hair stylists, and makeup artists who come to them. ` +
    `When I send this message, greet me as a ${persona} and ask what you can help me with. ` +
    `Rules you must follow in every reply: be SUPER succinct, never use more words than needed; ` +
    `match the VARS tone (professional, calm, forward-momentum, no passive blame, no deficit labels); ` +
    `if you need more context to answer accurately, search the internet but be honest about what you found versus what you know; ` +
    `if you genuinely cannot resolve my issue, tell me clearly and direct me to support: ${supportEmail}.`
  );
}

function Bubble({
  entry, expanded, onToggle, theme, s,
}: {
  entry: { id: string; title: string; body: string };
  expanded: boolean;
  onToggle: () => void;
  theme: VarsTheme;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity style={s.bubble} onPress={onToggle} activeOpacity={0.8}>
      <View style={s.bubbleHeader}>
        <Text style={s.bubbleTitle}>{entry.title}</Text>
        <VarsIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} color={theme.color.inkMuted} theme={theme} />
      </View>
      {expanded && <Text style={s.bubbleBody}>{entry.body}</Text>}
    </TouchableOpacity>
  );
}

function AIPlatformTile({ platform, onPress, s }: { platform: AIPlatform; onPress: () => void; s: ReturnType<typeof makeStyles> }) {
  return (
    <TouchableOpacity style={s.aiTile} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.aiTileBadge, { backgroundColor: platform.color }]}>
        <Text style={s.aiTileMonogram}>{platform.monogram}</Text>
      </View>
      <Text style={s.aiTileName}>{platform.name}</Text>
    </TouchableOpacity>
  );
}

export function CustomerCareScreen({ audience }: { audience: CustomerCareAudience }) {
  const insets = useSafeAreaInsets();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [identity, setIdentity] = useState<string>('N/A');

  const supportEmail = audience === 'vendor' ? 'support@bookwithvars.com' : 'hello@bookwithvars.com';

  const aiSheetRef = useRef<BottomSheetModal>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      // Phone-only accounts have no auth email; fall back to the auth phone so
      // support tickets always carry an identifying detail either way.
      setIdentity(user?.email ?? user?.phone ?? 'N/A');
    });
  }, []);

  const showNotice = useCallback((message: string, duration = 2500) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = setTimeout(() => setNotice(null), duration);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CUSTOMER_CARE_CONTENT.filter((entry) => {
      if (!entry.audiences.includes(audience)) return false;
      if (!q) return true;
      return entry.title.toLowerCase().includes(q) || entry.body.toLowerCase().includes(q);
    });
  }, [audience, search]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const handleWhatsApp = useCallback(async () => {
    const ticket = buildTicket();
    const message = encodeURIComponent(
      `Hi VARS, I need help with something.\n\nTicket: ${ticket}\nAccount: ${identity}`
    );
    try {
      await Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`);
    } catch {
      showNotice("Couldn't open WhatsApp on this device.");
    }
  }, [identity, showNotice]);

  const handleEmail = useCallback(async () => {
    const ticket = buildTicket();
    const subject = encodeURIComponent(`[${ticket}] VARS Support Request`);
    const body = encodeURIComponent(
      `[Write your message above this line, do not edit below]\n\n────────────────────────\nTicket: ${ticket}\nAccount: ${identity}`
    );
    try {
      await Linking.openURL(`mailto:${supportEmail}?subject=${subject}&body=${body}`);
    } catch {
      showNotice('No mail app is set up on this device.');
    }
  }, [identity, supportEmail, showNotice]);

  const handleAIPlatform = useCallback(async (platform: AIPlatform) => {
    const message = buildAIMessage(audience, supportEmail);
    await Clipboard.setStringAsync(message);
    showNotice("Copied. Paste it in if it's not already there.");
    try {
      await Linking.openURL(platform.buildUrl(message));
    } catch {
      // Clipboard copy already succeeded; the notice above covers this case too.
    }
  }, [audience, supportEmail, showNotice]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Customer Care</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchInputWrap}>
          <SearchIcon size={18} color={theme.color.inkMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search"
            placeholderTextColor={theme.color.inkMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <View style={s.aiButtonWrap}>
        <VarsButton
          label="Ask your AI"
          icon="sparkle"
          theme={theme}
          tone="info"
          variant="secondary"
          onPress={() => aiSheetRef.current?.present()}
        />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {visibleEntries.map((entry) => (
          <Bubble
            key={entry.id}
            entry={entry}
            expanded={expandedId === entry.id}
            onToggle={() => handleToggle(entry.id)}
            theme={theme}
            s={s}
          />
        ))}
        {visibleEntries.length === 0 && (
          <Text style={s.emptyText}>No topics match "{search}".</Text>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <VarsButton label="WhatsApp" theme={theme} variant="secondary" style={s.footerBtn} onPress={handleWhatsApp} />
        <VarsButton label="Email" theme={theme} variant="secondary" style={s.footerBtn} onPress={handleEmail} />
      </View>

      <BottomSheetModal ref={aiSheetRef} backgroundStyle={{ backgroundColor: theme.color.bg }} handleIndicatorStyle={{ backgroundColor: theme.color.inkFaint }}>
        <BottomSheetView style={[s.aiSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Text style={s.aiSheetTitle}>Ask your AI</Text>
          <Text style={s.aiSheetInstruction}>Just send the pre-filled message to get started.</Text>
          <View style={s.aiTileGrid}>
            {AI_PLATFORMS.map((platform) => (
              <AIPlatformTile key={platform.id} platform={platform} s={s} onPress={() => handleAIPlatform(platform)} />
            ))}
          </View>
          {notice && <VarsToast message={notice} theme={theme} />}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, paddingVertical: 8,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 28, color: theme.color.ink, lineHeight: 30 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    searchWrap: { paddingHorizontal: 16, paddingVertical: 10 },
    searchInputWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.color.surface2, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 16,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
    },
    searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: theme.color.ink },
    aiButtonWrap: { paddingHorizontal: 16, paddingBottom: 12 },
    scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    bubble: {
      backgroundColor: theme.color.surface0, borderRadius: BORDER_RADIUS,
      borderWidth: 1, borderColor: theme.color.inkFaint,
      padding: 14,
    },
    bubbleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bubbleTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.color.ink, marginRight: 8 },
    bubbleBody: { fontSize: 14, lineHeight: 20, color: theme.color.inkMuted, marginTop: 10 },
    emptyText: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', marginTop: 24 },
    footer: {
      flexDirection: 'row', gap: 10,
      paddingHorizontal: 16, paddingTop: 12,
      borderTopWidth: 1, borderTopColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
    },
    footerBtn: { flex: 1 },
    aiSheet: { paddingHorizontal: 20, paddingTop: 4 },
    aiSheetTitle: { fontSize: 18, fontWeight: '800', color: theme.color.ink, marginBottom: 4 },
    aiSheetInstruction: { fontSize: 14, color: theme.color.inkMuted, marginBottom: 18 },
    aiTileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    aiTile: { width: '30%', alignItems: 'center', gap: 8 },
    aiTileBadge: {
      width: 52, height: 52, borderRadius: 26,
      alignItems: 'center', justifyContent: 'center',
    },
    aiTileMonogram: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
    aiTileName: { fontSize: 12, fontWeight: '600', color: theme.color.ink, textAlign: 'center' },
  });
}
