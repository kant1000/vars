import { supabase } from './supabase';

/**
 * Detects the duplicate-phone rejection from fn_sync_phone_identity_registry
 * (see supabase/migrations/20260816201838_phone_identity_registry.sql), which
 * blocks a phone already claimed by any other account — same role or cross-role.
 * Direct table writes (savePhoneNumber, via PostgREST) surface the trigger's own
 * message text; auth.users inserts (phone OTP signup) go
 * through GoTrue, which wraps any AFTER INSERT trigger failure as a generic
 * "Database error saving new user" — that constraint is currently the only
 * thing that can fail there, so matching on GoTrue's generic wrapper is safe
 * in practice today.
 */
function isDuplicatePhoneAccountError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes('already registered to another account')
    || msg.includes('database error saving new user');
}

const DUPLICATE_PHONE_MESSAGE = "This phone number's already on VARS, try logging in instead.";

/**
 * Finish a brand-new customer account after their phone number has already
 * been OTP-verified: set a password, and record full name plus an optional
 * email (comms/receipts only, never re-verified). phone_number is never
 * written here — it's populated only by the DB trigger that syncs a
 * confirmed auth.users.phone (see supabase/migrations/20260819010001).
 */
export async function finishCustomerSignup(params: {
  userId: string;
  fullName: string;
  email?: string | null;
  password: string;
}) {
  const { error: pwError } = await supabase.auth.updateUser({ password: params.password });
  if (pwError) throw pwError;

  const updates: Record<string, string | boolean> = { full_name: params.fullName, password_set: true };
  if (params.email) updates.email = params.email;

  const { error } = await supabase.from('profiles').update(updates).eq('id', params.userId);
  if (error) {
    if (isDuplicatePhoneAccountError(error)) throw new Error(DUPLICATE_PHONE_MESSAGE);
    throw error;
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
