'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { browserClient, adminClient } from '@/lib/supabase';

export async function loginAction(formData: FormData): Promise<{ error: string } | never> {
  const email    = (formData.get('email') as string | null)?.trim().toLowerCase() ?? '';
  const password = (formData.get('password') as string | null) ?? '';

  if (!email || !password) return { error: 'Email and password are required.' };

  const auth = browserClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: 'Invalid credentials.' };

  // Verify the user exists in admin_users
  const db = adminClient();
  const { data: adminRow } = await db
    .from('admin_users')
    .select('id')
    .eq('id', data.user.id)
    .single();

  if (!adminRow) {
    await auth.auth.signOut();
    return { error: 'Account not authorised for admin access.' };
  }

  const cookieStore = cookies();
  cookieStore.set('sb-access-token', data.session.access_token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   data.session.expires_in,
    path:     '/',
  });

  redirect('/dashboard');
}

export async function logoutAction() {
  const cookieStore = cookies();
  cookieStore.delete('sb-access-token');
  redirect('/login');
}
