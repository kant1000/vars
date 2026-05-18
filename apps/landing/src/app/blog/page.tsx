import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { articles } from './articles';

const blogDescription =
  "Wide Awake covers money, mindset, culture, and everything Nigerians aren't supposed to talk about openly.";

export const metadata: Metadata = {
  title: { absolute: 'Wide Awake — A blog by Vars' },
  description: blogDescription,
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Wide Awake — A blog by Vars',
    description: blogDescription,
    url: '/blog',
    type: 'website',
    siteName: 'Wide Awake by Vars',
    images: [{ url: '/blog/the-culture-of-shame.png', width: 1200, height: 675, alt: 'Wide Awake — A blog by Vars' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wide Awake — A blog by Vars',
    description: blogDescription,
    images: ['/blog/the-culture-of-shame.png'],
  },
};

export default function BlogIndexPage() {
  const liveArticles = articles.filter((a) => a.body !== null);
  const comingSoonArticles = articles.filter((a) => a.body === null);

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

      <main>
        <div className="section-block">
          <div className="section-label-row">
            <span className="section-label">Live now</span>
          </div>
          <div className="article-grid">
            {liveArticles.map((article) => (
              <article key={article.slug} className="article-card">
                <Link href={`/blog/${article.slug}`} className="card-img-link">
                  <div className="card-img">
                    <Image
                      src={article.image}
                      alt={article.imageAlt}
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="(max-width: 640px) 100vw, (max-width: 900px) 45vw, 280px"
                    />
                  </div>
                </Link>
                <div className="card-meta-row">
                  <span className="card-cat">{article.category}</span>
                  <span className="badge badge-live">Live</span>
                </div>
                <h2>
                  <Link href={`/blog/${article.slug}`}>{article.cardTitle ?? article.title}</Link>
                </h2>
                <p className="card-gist">{article.gist}</p>
                <span className="card-meta">{article.readTime}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="section-block">
          <div className="section-label-row">
            <span className="section-label">Coming soon</span>
          </div>
          <div className="article-grid article-grid--muted">
            {comingSoonArticles.map((article) => (
              <article key={article.slug} className="article-card article-card--muted">
                <div className="card-img">
                  <Image
                    src={article.image}
                    alt={article.imageAlt}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="(max-width: 640px) 100vw, (max-width: 900px) 45vw, 280px"
                  />
                </div>
                <div className="card-meta-row">
                  <span className="card-cat">{article.category}</span>
                  <span className="badge badge-soon">Coming soon</span>
                </div>
                <h2>{article.cardTitle ?? article.title}</h2>
                <p className="card-gist">{article.gist}</p>
                <span className="card-meta">{article.readTime}</span>
              </article>
            ))}
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <span className="f-brand">Wide Awake</span>
        <p>A blog by <Link href="/">Vars</Link> — playing The Long Game.</p>
      </footer>
    </>
  );
}
