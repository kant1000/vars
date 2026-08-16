import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Detects the cross-role phone_number rejection from fn_check_cross_role_phone_unique
 * (see supabase/migrations/20260816000009_cross_role_phone_uniqueness.sql). Direct
 * table writes (savePhoneNumber, via PostgREST) surface the trigger's own message
 * text; auth.users inserts (signUpWithEmail, vendor OTP signup) go through GoTrue,
 * which wraps any AFTER INSERT trigger failure as a generic "Database error saving
 * new user" — that constraint is currently the only thing that can fail there, so
 * matching on GoTrue's generic wrapper is safe in practice today.
 */
function isDuplicatePhoneAccountError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes('already registered under a different account type')
    || msg.includes('database error saving new user');
}

const DUPLICATE_PHONE_MESSAGE = "This phone number's already on VARS, try logging in instead.";

/**
 * Sign in with Google via Supabase OAuth.
 * Uses Expo AuthSession for the OAuth redirect flow.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'vars', path: 'auth/callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (result.type !== 'success' || !result.url) return false;

  const { queryParams } = Linking.parse(result.url);
  const oauthError = queryParams?.error;
  const errorDescription = queryParams?.error_description;
  if (typeof oauthError === 'string') {
    throw new Error(typeof errorDescription === 'string' ? errorDescription : oauthError);
  }

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
  if (sessionError) throw sessionError;

  return true;
}

/**
 * Sign in with Facebook via Supabase OAuth.
 */
export async function signInWithFacebook(): Promise<boolean> {
  const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'vars', path: 'auth/callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (result.type !== 'success' || !result.url) return false;

  const { queryParams } = Linking.parse(result.url);
  const oauthError = queryParams?.error;
  const errorDescription = queryParams?.error_description;
  if (typeof oauthError === 'string') {
    throw new Error(typeof errorDescription === 'string' ? errorDescription : oauthError);
  }

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
  if (sessionError) throw sessionError;

  return true;
}

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Sign up with email and password.
 * Full name and phone are stored in user metadata — trigger creates profile row.
 * Returns needsConfirmation=true when Supabase requires email verification
 * before a session is issued (the default). Callers must handle this case
 * and NOT navigate into the app — there is no real session yet.
 */
export async function signUpWithEmail(params: {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
}): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        full_name: params.fullName,
        phone_number: params.phoneNumber,
        user_type: 'user',
      },
    },
  });
  if (error) {
    if (isDuplicatePhoneAccountError(error)) throw new Error(DUPLICATE_PHONE_MESSAGE);
    throw error;
  }
  return { needsConfirmation: !data.session };
}

/**
 * Update phone number on existing profile.
 * Called after social login when phone is not yet set.
 */
export async function savePhoneNumber(userId: string, phoneNumber: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ phone_number: phoneNumber })
    .eq('id', userId);
  if (error) {
    if (isDuplicatePhoneAccountError(error)) throw new Error(DUPLICATE_PHONE_MESSAGE);
    throw error;
  }
}

/**
 * Check whether a user's profile has a phone number set.
 * Used to decide if we need to show the phone collection screen after social login.
 */
export async function profileHasPhone(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('phone_number')
    .eq('id', userId)
    .single();
  return !!(data?.phone_number && data.phone_number.trim().length > 0);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
