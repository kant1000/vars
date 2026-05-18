'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { postComment } from './actions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Comment = { id: string; name: string; body: string; created_at: string };

export default function CommentSection({ slug }: { slug: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('blog_comments')
      .select('id, name, body, created_at')
      .eq('article_slug', slug)
      .eq('approved', true)
      .order('created_at', { ascending: true });
    setComments(data ?? []);
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setDone(false);
    const fd = new FormData(e.currentTarget);
    fd.append('slug', slug);
    const result = await postComment(fd);
    if (result.error) {
      setErr(result.error);
    } else {
      setDone(true);
      (e.target as HTMLFormElement).reset();
      await fetchComments();
    }
    setSubmitting(false);
  };

  return (
    <section className="comment-section">
      <h4 className="comment-heading">
        {loading ? 'Comments' : comments.length > 0
          ? `${comments.length} comment${comments.length === 1 ? '' : 's'}`
          : 'Comments'}
      </h4>

      {!loading && comments.length === 0 && (
        <p className="comment-empty">No comments yet. Be the first.</p>
      )}

      {!loading && comments.length > 0 && (
        <div className="comment-list">
          {comments.map((c) => (
            <div key={c.id} className="comment-item">
              <div className="comment-meta">
                <span className="comment-name">{c.name}</span>
                <span className="comment-date">
                  {new Date(c.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
              <p className="comment-body">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="comment-form">
        <h5 className="comment-form-heading">Leave a comment</h5>
        <div className="comment-form-row">
          <div className="comment-field">
            <label htmlFor={`name-${slug}`}>Name</label>
            <input id={`name-${slug}`} name="name" type="text" required placeholder="Your name" maxLength={60} />
          </div>
          <div className="comment-field">
            <label htmlFor={`email-${slug}`}>
              Email <span className="comment-email-note">(not shown)</span>
            </label>
            <input id={`email-${slug}`} name="email" type="email" required placeholder="your@email.com" />
          </div>
        </div>
        <div className="comment-field">
          <label htmlFor={`body-${slug}`}>Comment</label>
          <textarea
            id={`body-${slug}`}
            name="body"
            required
            rows={4}
            placeholder="What are your thoughts?"
            maxLength={1000}
            onFocus={() => setDone(false)}
          />
        </div>
        {err && <p className="comment-error">{err}</p>}
        {done && <p className="comment-success">Comment posted. Thank you.</p>}
        <button type="submit" disabled={submitting} className="comment-submit">
          {submitting ? 'Posting...' : 'Post comment'}
        </button>
      </form>
    </section>
  );
}
