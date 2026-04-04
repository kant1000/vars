// ============================================================
// VARS Admin — auth helpers
// Checks admin_users table for the signed-in user's email.
// ============================================================
import { adminClient } from './supabase';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/supabase-js';

export async function requireAdmin() {
  // Read session from cookie (set by Supabase Auth in the browser)
  const cookieStore = cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  if (!accessToken) return null;

  const admin = adminClient();

  // Verify token and get user
  const { data: { user }, error } = await admin.auth.getUser(accessToken);
  if (error || !user) return null;

  // Check admin_users table
  const { data: adminRow } = await admin
    .from('admin_users')
    .select('id, email, role')
    .eq('email', user.email!)
    .eq('is_active', true)
    .single();

  return adminRow ?? null;
}
