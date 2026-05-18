export interface Article {
  slug: string;
  title: string;
  gist: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  image: string;
  imageAlt: string;
  body: string | null;
  related: string[];
}

export const articles: Article[] = [
  {
    slug: 'nigerian-mind-was-never-broken',
    title: 'The Nigerian Mind Was Never Broken. It Was Locked.',
    gist: "We didn't grow up afraid of thinking. We grew up in systems that punished it. That difference changes what you do next.",
    category: 'Mindset',
    author: 'Seyi Ibitoye',
    date: 'May 18, 2026',
    readTime: '6 min read',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80',
    imageAlt: 'Man thinking',
    body: `<p>There's a particular kind of silence that happens in Nigerian classrooms when a teacher asks a question they didn't expect anyone to actually answer. Not the silence of thinking. The silence of calculation: who speaks, who gets humiliated, who stays safe by saying nothing.</p>

<p>Most of us learned that silence early. We got so good at it we started calling it wisdom.</p>

<p>This is not about intelligence. Nigeria has no shortage of intelligent people. It is about something that happens before intelligence gets a chance to operate: the moment when a mind decides whether thinking openly is worth the cost.</p>

<h2>The Cost of Being Right Out Loud</h2>

<p>In environments where authority is fragile, being visibly, publicly right is a provocation. It implies that the person with the answer was wrong. That kind of implication has consequences. So we learned to hold our answers lightly, share them quietly, and let the person with the title believe they arrived first.</p>

<p>This was rational. In the short term, it still is. The problem is that short-term rationality, practised for decades, becomes a reflex. And reflexes don't stop at the classroom door. They follow you into meetings, into marriages, into how you raise your children, into whether you ever tell your boss they're wrong about something that matters.</p>

<div class="pull-quote"><p>"We learned to hold our answers lightly, share them quietly, and let the person with the title believe they arrived first."</p></div>

<h2>What a Locked Mind Looks Like</h2>

<p>A locked mind is not a closed mind. A closed mind refuses new information. A locked mind accepts it: processes it, evaluates it, forms a clear view, and then does not act on it, because acting on your own thinking feels presumptuous.</p>

<p>You can spot it in how people talk about ideas. Phrases like <em>"I'm not an expert, but…"</em> before a completely valid observation. Or the habit of citing a foreign source to legitimise something they already knew. Or the way Nigerians will argue passionately about football tactics, a space where there is no authority to defer to, and then go completely silent about the things that actually affect their lives.</p>

<p>It's not that we can't think. We think all the time. We just learned to do it quietly and call that humility.</p>

<h2>The Way Back</h2>

<p>The good news is that a locked thing can be unlocked. Locks require keys, not repairs. The mind itself is fine.</p>

<p>The key is low-stakes practice. Start thinking out loud in spaces where being wrong costs nothing: with friends who are genuinely curious, in writing no one else has to read, in decisions small enough that failure is just information. The goal is to rebuild the connection between having a thought and acting on it, without the old penalty system firing every time.</p>

<p>It takes longer than it should, because the reflex runs deep. But the reflex was learned. That means it can be unlearned.</p>

<p>You were never broken. You just adapted. Now adapt again.</p>`,
    related: ['why-nigerians-save-wrong', 'ajo-problem', 'compounding-is-obvious'],
  },
  {
    slug: 'why-nigerians-save-wrong',
    title: 'Why Most Nigerians Save Wrong (And What To Do Instead)',
    gist: "Saving in naira while inflation runs at 30% isn't discipline. It's a slow leak.",
    category: 'Money & Investing',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '8 min read',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
    imageAlt: 'Finance',
    body: null,
    related: ['nigerian-mind-was-never-broken', 'ajo-problem', 'compounding-is-obvious'],
  },
  {
    slug: 'bitcoin-only-hedge',
    title: "Bitcoin Isn't Magic. But It Might Be the Only Hedge That Makes Sense Here.",
    gist: "Not a prediction. A cold look at what crypto actually offers someone living in a devaluing currency.",
    category: 'Crypto',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '10 min read',
    image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1200&q=80',
    imageAlt: 'Crypto',
    body: null,
    related: ['why-nigerians-save-wrong', 'ajo-problem', 'compounding-is-obvious'],
  },
  {
    slug: 'ajo-problem',
    title: "The Ajo Problem: Why Our Best Financial Tool Has No App",
    gist: "Rotating savings circles predate every fintech startup. Why are we embarrassed by them?",
    category: 'Society',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '7 min read',
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=80',
    imageAlt: 'Lagos',
    body: null,
    related: ['why-nigerians-save-wrong', 'nigerian-mind-was-never-broken', 'compounding-is-obvious'],
  },
  {
    slug: 'family-tax-trap',
    title: "When Family Tax Becomes a Trap: Drawing a Line Without Burning It",
    gist: "Supporting family is noble. Doing it without a plan is how ambition dies quietly in your 30s.",
    category: 'Family',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '9 min read',
    image: 'https://images.unsplash.com/photo-1511895426328-dc8714191011?w=1200&q=80',
    imageAlt: 'Family',
    body: null,
    related: ['why-nigerians-save-wrong', 'nigerian-mind-was-never-broken', 'compounding-is-obvious'],
  },
  {
    slug: 'compounding-is-obvious',
    title: "Compounding Is Obvious. Why Don't More of Us Do It?",
    gist: "Everyone knows compound interest works. Something else is stopping us. It is not math.",
    category: 'The Long Game',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '6 min read',
    image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&q=80',
    imageAlt: 'Long game',
    body: null,
    related: ['why-nigerians-save-wrong', 'nigerian-mind-was-never-broken', 'ajo-problem'],
  },
];

export function getArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
