import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { articles, getArticle } from '../articles';
import ShareBar from '../ShareBar';
import ProgressBar from '../ProgressBar';
import CommentSection from '../CommentSection';

const SITE = 'https://www.bookwithvars.com';

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

  const isLive = article.body !== null;
  const imageUrl = article.image.startsWith('/')
    ? `${SITE}${article.image}`
    : article.image;

  return {
    title: { absolute: `${article.title} | Wide Awake` },
    description: article.gist,
    keywords: article.keywords,
    alternates: { canonical: `/blog/${article.slug}` },
    robots: isLive ? undefined : { index: false, follow: false },
    openGraph: {
      title: article.title,
      description: article.gist,
      url: `/blog/${article.slug}`,
      type: 'article',
      siteName: 'Wide Awake by Vars',
      images: [{ url: imageUrl, width: 1200, height: 675, alt: article.imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.gist,
      images: [imageUrl],
    },
  };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  const isLive = article.body !== null;
  const imageUrl = article.image.startsWith('/')
    ? `${SITE}${article.image}`
    : article.image;

  const relatedArticles = article.related
    .map((slug) => articles.find((a) => a.slug === slug))
    .filter(Boolean);

  const jsonLd = isLive
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title,
        description: article.gist,
        image: imageUrl,
        author: { '@type': 'Person', name: article.author },
        publisher: {
          '@type': 'Organization',
          name: 'Wide Awake by Vars',
          url: SITE,
        },
        datePublished: new Date(article.date).toISOString().split('T')[0],
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${SITE}/blog/${article.slug}`,
        },
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProgressBar />

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
          <Image
            src={article.image}
            alt={article.imageAlt}
            fill
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 728px) 100vw, 680px"
            priority
          />
        </div>

        {article.body ? (() => {
          const cut = article.body!.indexOf('<h2>');
          const intro = cut > -1 ? article.body!.slice(0, cut) : article.body!;
          const rest  = cut > -1 ? article.body!.slice(cut) : '';
          return (
            <>
              <div className="article-body" dangerouslySetInnerHTML={{ __html: intro }} />
              <div className="cta-block">
                <p><strong>Wide Awake is a blog. Vars is what we built.</strong></p>
                <p>
                  Vars connects stylists, barbers, hair dressers, MUAs and more,
                  with new customers who need these services at home.
                </p>
                <p className="cta-question">Do you have any of these skills?</p>
                <Link href="/" className="cta-btn">Join Vars as a Vendor →</Link>
              </div>
              {rest && <div className="article-body" dangerouslySetInnerHTML={{ __html: rest }} />}
            </>
          );
        })() : (
          <div className="article-body">
            <p style={{ color: '#888888', fontStyle: 'italic' }}>
              This article is coming soon.
            </p>
          </div>
        )}

        {isLive && <ShareBar title={article.title} slug={article.slug} />}

        <div className="long-game-callout">
          <span className="long-game-label">The Long Game</span>
          <p>
            Every article in Wide Awake is written for the version of you
            that&apos;s building something: slowly, deliberately, without shortcuts.
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

        {isLive && <CommentSection slug={article.slug} />}
      </article>

      <footer className="site-footer">
        <span className="f-brand">Wide Awake</span>
        <p>
          A blog by <Link href="/">Vars</Link>. Playing The Long Game.
        </p>
      </footer>
    </>
  );
}
