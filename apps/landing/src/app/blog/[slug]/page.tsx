import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { articles, getArticle } from '../articles';

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const article = getArticle(params.slug);
  if (!article) return {};
  return {
    title: `${article.title} | Wide Awake`,
    description: article.gist,
    alternates: { canonical: `/blog/${article.slug}` },
  };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  const relatedArticles = article.related
    .map((slug) => articles.find((a) => a.slug === slug))
    .filter(Boolean);

  return (
    <>
      <header className="site-header">
        <Link href="/blog" className="wordmark">Wide Awake</Link>
        <span className="byline">by Vars</span>
        <nav>
          <Link href="/blog">← All articles</Link>
        </nav>
      </header>

      <article className="article-wrap">
        <header className="article-header">
          <span className="art-cat">{article.category}</span>
          <h1>{article.title}</h1>
          <div className="art-meta">
            <span>{article.author}</span>
            <span className="sep">·</span>
            <span>{article.date}</span>
            <span className="sep">·</span>
            <span>{article.readTime}</span>
          </div>
        </header>

        <div className="gist-block">
          <span className="gist-label">The Gist</span>
          <p>{article.gist}</p>
        </div>

        <div className="article-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.image} alt={article.imageAlt} />
        </div>

        {article.body ? (
          <div
            className="article-body"
            dangerouslySetInnerHTML={{ __html: article.body }}
          />
        ) : (
          <div className="article-body">
            <p style={{ color: '#888888', fontStyle: 'italic' }}>
              This article is coming soon.
            </p>
          </div>
        )}

        <div className="long-game-callout">
          <span className="long-game-label">The Long Game</span>
          <p>
            Every article in Wide Awake is written for the version of you
            that&apos;s building something — slowly, deliberately, without shortcuts.
          </p>
        </div>

        {relatedArticles.length > 0 && (
          <div className="related-section">
            <h4>Keep reading</h4>
            <div className="related-list">
              {relatedArticles.map(
                (related) =>
                  related && (
                    <div key={related.slug} className="related-item">
                      <span className="r-cat">{related.category}</span>
                      <Link href={`/blog/${related.slug}`}>{related.title}</Link>
                    </div>
                  )
              )}
            </div>
          </div>
        )}

        <div className="cta-block">
          <div className="cta-top">From the team behind this blog</div>
          <p>
            <strong>Wide Awake is a blog. Vars is what we built.</strong>
          </p>
          <p>
            Vars connects Nigerian stylists — barbers, hair dressers, MUAs, nail
            techs — with customers who need beauty and grooming services at their
            homes.
          </p>
          <p className="cta-question">
            Are you a stylist? We&apos;re open to you only for now.
          </p>
          <Link href="/" className="cta-btn">
            Join Vars as a Vendor →
          </Link>
        </div>
      </article>

      <footer className="site-footer">
        <span className="f-brand">Wide Awake</span>
        <p>
          A blog by <Link href="/">Vars</Link> — playing The Long Game.
        </p>
      </footer>
    </>
  );
}
