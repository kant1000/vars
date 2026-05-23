import type { MetadataRoute } from 'next';
import { articles } from './blog/articles';

const siteUrl = 'https://www.bookwithvars.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const liveArticles = articles.filter((a) => a.body !== null);

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...liveArticles.map((a) => ({
      url: `${siteUrl}/blog/${a.slug}`,
      lastModified: new Date(a.date),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${siteUrl}/roadmap`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
