// ============================================================
// VARS Admin — Supabase client (service role — bypasses RLS)
// Only used server-side in Next.js Route Handlers / Server Actions.
// ============================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client — for admin auth session only (lazy: deferred to call time)
export function browserClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Server-side admin client — service role, bypasses RLS
export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
