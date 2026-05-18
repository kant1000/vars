'use server';
import { createClient } from '@supabase/supabase-js';

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function postComment(formData: FormData): Promise<{ success?: true; error?: string }> {
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  const email = (formData.get('email') as string | null)?.trim().toLowerCase() ?? '';
  const body = (formData.get('body') as string | null)?.trim() ?? '';
  const slug = (formData.get('slug') as string | null) ?? '';

  if (name.length < 2 || name.length > 60)
    return { error: 'Name must be between 2 and 60 characters.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: 'Please enter a valid email address.' };
  if (body.length < 10 || body.length > 1000)
    return { error: 'Comment must be between 10 and 1000 characters.' };
  if (!slug)
    return { error: 'Something went wrong. Please try again.' };

  const { error } = await getClient()
    .from('blog_comments')
    .insert({ article_slug: slug, name, email, body, approved: true });

  if (error) return { error: 'Could not save your comment. Please try again.' };
  return { success: true };
}
