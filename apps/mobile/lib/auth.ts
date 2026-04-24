import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Google via Supabase OAuth.
 * Uses Expo AuthSession for the OAuth redirect flow.
 */
export async function signInWithGoogle() {
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

  if (result.type === 'success' && result.url) {
    const { queryParams } = Linking.parse(result.url);
    const error = queryParams?.error;
    const errorDescription = queryParams?.error_description;
    if (typeof error === 'string') {
      throw new Error(typeof errorDescription === 'string' ? errorDescription : error);
    }

    // Exchange the code for a session
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (sessionError) throw sessionError;
  }
}

/**
 * Sign in with Facebook via Supabase OAuth.
 */
export async function signInWithFacebook() {
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

  if (result.type === 'success' && result.url) {
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (sessionError) throw sessionError;
  }
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
 */
export async function signUpWithEmail(params: {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
}) {
  const { error } = await supabase.auth.signUp({
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
  if (error) throw error;
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
  if (error) throw error;
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
