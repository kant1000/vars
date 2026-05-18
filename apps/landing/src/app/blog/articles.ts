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
    slug: 'the-culture-of-shame',
    title: 'Nigeria Has Over 250 Cultures. Shame Is the One We All Share.',
    gist: "It hides in plain sight. Nigerians practise it across every tribe, every generation, every dinner table. Nobody calls it what it is.",
    category: 'Society',
    author: 'Seyi Ibitoye',
    date: 'May 18, 2026',
    readTime: '8 min read',
    image: '/blog/the-culture-of-shame.png',
    imageAlt: 'Man in thought at a table',
    body: `<p>Two sisters sit in the same room. Same argument. One gives her version of events and the other shakes her head. Then the second speaks, and the first says "when?" She was right there. She watched the whole thing. She has no memory of it.</p>

<p>The insight from watching this happen is simple and exact: the mind locks like a missile. Once it decides what it wants to see, no amount of evidence from the outside will move it.</p>

<p>Scale that from a family argument to a country of 200 million, and something starts to make sense about how Nigerians relate to one another.</p>

<h2>The Culture Nobody Named</h2>

<p>Nigeria has over 250 distinct languages and hundreds of tribal cultures. People are quick to point out what separates them. They are less quick to name what they share.</p>

<p>There is one culture that cuts across every line: tribe, class, gender, generation. It is not loud. It does not announce itself. It hides inside ordinary behaviour, in phrases people use every day, in decisions people make without knowing they are making them.</p>

<p>It is the culture of shame.</p>

<h2>Where It Was Planted</h2>

<p>When the Atlantic slave trade ended, it reinvented itself as colonisation. The first Nigerians to master the colonial language were promoted above their peers. Given shoes, khaki, and a baton. Still enslaved to the same master, but now standing over their own people.</p>

<p>That structure did not leave when the colonial officers did. The relationship between the one with the baton and the one without became a template. It was absorbed quietly, passed on, and repeated in new forms. Abuse moves. It finds new hosts.</p>

<p>It explains the prestige attached to certain addresses in Lagos that have nothing remarkable about them except that the colonisers once lived there. It explains the instinct to add a foreign name to a business proposal to make it feel credible. It explains why the word "imported" still functions as a compliment.</p>

<h2>How It Shows Up Every Day</h2>

<p>Shame shows up in ordinary ways that seem like something else. The insistence on the very centre of the front row at a party. The borrowed title attached to a name. The reflexive distrust of a Nigerian tailor, even when the quality of the work is obvious.</p>

<p>"See your mates." "I'm not your mate." Phrases deployed every day that sound like assertion but are shame running at operating temperature.</p>

<div class="pull-quote"><p>"If we get rid of shame, the things that bother us will not bother us anymore. Because if you know yourself, you know yourself."</p></div>

<p>Shame shows up in how society treats women who are unmarried at 40, divorced at 40, or childless at 40. It shows up in COVID patients who hid their diagnosis long after the risk had passed. It shows up in the man who spends on a table not because he wants the experience but because he needs to be seen having it. One is enjoying the party. The other is performing at it.</p>

<p>The difference between the two is not income. It is whether or not the person at the table knows themselves well enough not to need the table to prove it.</p>

<h2>The Factory That Keeps Making It</h2>

<p>The most reliable source of shame in Nigeria is not poverty or social media. It is the secondary school system, specifically the tradition of giving senior students authority to punish junior ones.</p>

<p>A 16-year-old is handed a baton. Implicitly or directly, they are told that their year group permits them to humiliate someone younger. This is called character building. It is abuse wearing uniform.</p>

<p>The child who is bullied graduates carrying damage. The one who does the bullying graduates addicted to a kind of power they were never supposed to hold. Both enter adulthood looking for a way to recreate the sensation. One wants revenge. The other wants dominance. Both find fraternities, titles, and positions that serve the same function.</p>

<p>That is where a significant portion of Nigerian public behaviour originates. Not tribalism. Not even greed. The rehearsal of power that started in a dormitory when someone was 15 years old.</p>

<h2>What Can Actually Change</h2>

<p>Changing the adults who have spent 30 years inside this system is genuinely difficult. The patterns run deep and the incentives are too embedded for a speech or an article to reach.</p>

<p>But children are still early enough.</p>

<p>Schools can teach love the same way they teach mathematics. Repeat it every year from primary school to graduation and something accumulates. They can teach collaboration instead of ranking. They can teach public behaviour, emotional intelligence, how to disagree without humiliating. They can end the practice of students punishing students, which exists nowhere in the education systems of countries that Nigerians keep pointing to as models.</p>

<p>A society that addresses its shame does not become soft. It becomes confident enough to stop performing and start building.</p>`,
    related: ['why-nigerians-save-wrong', 'family-tax-trap', 'compounding-is-obvious'],
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
    related: ['the-culture-of-shame', 'ajo-problem', 'compounding-is-obvious'],
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
    related: ['the-culture-of-shame', 'why-nigerians-save-wrong', 'compounding-is-obvious'],
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
    related: ['the-culture-of-shame', 'why-nigerians-save-wrong', 'compounding-is-obvious'],
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
    related: ['the-culture-of-shame', 'why-nigerians-save-wrong', 'ajo-problem'],
  },
];

export function getArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
