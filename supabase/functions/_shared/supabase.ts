import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Admin client — bypasses RLS. Use only in edge functions for system operations.
 * Never expose the service role key to the client.
 */
export function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Authenticated client — respects RLS. Use when acting on behalf of a user.
 */
export function createAuthClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
