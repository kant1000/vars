import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Small badge-dot signal for the Alerts tab icon — not the notifications
// list itself, which does its own full fetch. Existence-only (`hasUnread`),
// not a count, since the tab bar only ever shows a dot, never a number.
export function useUnreadNotifications() {
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setHasUnread(false); return; }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);
    setHasUnread((count ?? 0) > 0);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`unread-notifs:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, () => setHasUnread(true))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  return hasUnread;
}
