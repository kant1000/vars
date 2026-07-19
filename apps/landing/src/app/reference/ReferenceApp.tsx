'use client';
// Reference doc shell: Partners (open) and Board (password-gated) audiences.
// Password check is client-side friction, not real access control - the value
// ships in the JS bundle same as the source doc's design. See build notes.
import { useCallback, useEffect, useState } from 'react';
import { HomeTiles } from './components/HomeTiles';
import { AudienceHeader } from './components/AudienceHeader';
import { SearchBar } from './components/SearchBar';
import { BubbleGrid } from './components/BubbleGrid';
import { PasswordGate } from './components/PasswordGate';
import { AskAIButton } from './components/AskAIButton';
import { AIModal } from './components/AIModal';
import { ContactFooter } from './components/ContactFooter';
import { PARTNER_BUBBLES } from './data/partnerBubbles';
import { BOARD_BUBBLES } from './data/boardBubbles';
import type { Audience } from './data/aiPlatforms';

const BOARD_SESSION_KEY = 'vars-board-unlocked';
const BOARD_PASSWORD = 'srav';

type Screen = 'home' | 'partner' | 'gate' | 'board';

function screenFromLocation(): Screen {
  const audience = new URLSearchParams(window.location.search).get('audience');
  if (audience === 'partner') return 'partner';
  if (audience === 'board') {
    return sessionStorage.getItem(BOARD_SESSION_KEY) === '1' ? 'board' : 'gate';
  }
  return 'home';
}

export function ReferenceApp() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    setScreen(screenFromLocation());
    setReady(true);

    const onPopState = () => setScreen(screenFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const goHome = useCallback(() => {
    setSelectedId(null);
    setSearch('');
    setScreen('home');
    window.history.pushState({}, '', window.location.pathname);
  }, []);

  const openPartner = useCallback(() => {
    setScreen('partner');
    window.history.pushState({}, '', '?audience=partner');
  }, []);

  const openBoard = useCallback(() => {
    window.history.pushState({}, '', '?audience=board');
    setScreen(sessionStorage.getItem(BOARD_SESSION_KEY) === '1' ? 'board' : 'gate');
  }, []);

  const submitPassword = useCallback((value: string) => {
    if (value !== BOARD_PASSWORD) return false;
    sessionStorage.setItem(BOARD_SESSION_KEY, '1');
    setScreen('board');
    return true;
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setSelectedId(null);
  }, []);

  if (!ready) return null;

  const audience: Audience = screen === 'board' ? 'board' : 'partner';
  const bubbles = screen === 'board' ? [...PARTNER_BUBBLES, ...BOARD_BUBBLES] : PARTNER_BUBBLES;

  const q = search.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const filtered = bubbles.filter((b) => {
    if (words.length === 0) return true;
    const haystack = `${b.title} ${b.category} ${b.keywords}`.toLowerCase();
    return words.some((w) => haystack.includes(w));
  });

  return (
    <div className="ref-root">
      {screen === 'home' && <HomeTiles onPartner={openPartner} onBoard={openBoard} />}

      {(screen === 'partner' || screen === 'board') && (
        <>
          <AudienceHeader audience={screen === 'board' ? 'Board' : 'Partners'} onBack={goHome} />
          <div className="ref-body">
            <SearchBar value={search} onChange={handleSearch} />
            <BubbleGrid bubbles={filtered} selectedId={selectedId} onSelect={handleSelect} />
            {filtered.length === 0 && <p className="ref-nores">No topics match that search.</p>}
            <AskAIButton onPress={() => setAiOpen(true)} />
          </div>
          <ContactFooter />
        </>
      )}

      {screen === 'gate' && <PasswordGate onBack={goHome} onSubmit={submitPassword} />}

      <AIModal open={aiOpen} onClose={() => setAiOpen(false)} audience={audience} />
    </div>
  );
}
