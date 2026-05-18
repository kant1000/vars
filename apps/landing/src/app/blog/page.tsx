import Link from 'next/link';
import type { Metadata } from 'next';
import { articles } from './articles';

export const metadata: Metadata = {
  title: 'Wide Awake — A blog by Vars',
  description:
    "Wide Awake covers money, mindset, culture, and everything Nigerians aren't supposed to talk about openly.",
  alternates: { canonical: '/blog' },
};

export default function BlogIndexPage() {
  return (
    <>
      <header className="site-header">
        <Link href="/blog" className="wordmark">Wide Awake</Link>
        <span className="byline">by Vars</span>
        <nav>
          <Link href="/">bookwithvars.com</Link>
        </nav>
      </header>

      <section className="index-hero">
        <h1>Ideas worth<br />sitting with.</h1>
        <p>Wide Awake covers money, mindset, culture, and everything Nigerians aren&apos;t supposed to talk about openly.</p>
        <p className="long-game-tagline">Playing The Long Game.</p>
      </section>

      <main className="article-grid">
        {articles.map((article) => (
          <article key={article.slug} className="article-card">
            <div className="card-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={article.image} alt={article.imageAlt} />
            </div>
            <span className="card-cat">{article.category}</span>
            <h2>
              <Link href={`/blog/${article.slug}`}>{article.title}</Link>
            </h2>
            <p className="card-gist">{article.gist}</p>
            <span className="card-meta">{article.readTime}</span>
          </article>
        ))}
      </main>

      <footer className="site-footer">
        <span className="f-brand">Wide Awake</span>
        <p>A blog by <Link href="/">Vars</Link> — playing The Long Game.</p>
      </footer>
    </>
  );
}
