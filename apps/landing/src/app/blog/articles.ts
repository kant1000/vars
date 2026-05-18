export interface Article {
  slug: string;
  title: string;
  cardTitle?: string;
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
    cardTitle: 'Shame is the one culture we all share.',
    gist: "It hides in plain sight. Nigerians practise it across every tribe, every generation, every dinner table. Nobody calls it what it is.",
    category: 'Society',
    author: 'Seyi Ibitoye',
    date: 'May 18, 2026',
    readTime: '8 min read',
    image: '/blog/the-culture-of-shame.png',
    imageAlt: 'Man in thought at a table',
    body: `<p>Two sisters sit in the same room. Same argument. One gives her version of events and the other shakes her head. When the second has finished speaking, the first looks up: "When did that happen?" She had been present the whole time. She watched it unfold. She has no memory of it.</p>

<p>The mind does not record what it has decided not to see. Once it settles on a reading of events, no evidence from outside will move it. From the inside, this feels like certainty.</p>

<p>Take that from one family argument to a country of 200 million, and something about how Nigerians relate to one another comes into focus.</p>

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

<p>A society that addresses its shame does not become soft. It becomes confident enough to stop performing and start building.</p>

<p><em>The conversation this piece draws from is <a href="https://www.youtube.com/watch?v=EMAgbt3m5Gs" target="_blank" rel="noopener noreferrer">available here</a>.</em></p>`,
    related: ['talent-without-trust', 'family-tax-trap', 'compounding-is-obvious'],
  },
  {
    slug: 'talent-without-trust',
    title: 'Lagos Has the Talent. The Infrastructure Is What\'s Missing.',
    cardTitle: 'The talent is there. The trust is not.',
    gist: "The trust gap between a Lagos stylist and their next client has nothing to do with skill. It never did.",
    category: 'Vars',
    author: 'Seyi Ibitoye',
    date: 'May 25, 2026',
    readTime: '6 min read',
    image: '/blog/talent-without-trust.png',
    imageAlt: 'Lagos barber at work',
    body: `<p>A Lagos barber arrives at a home visit. The client has made food. He films himself at the table: "Went for HomeServices. Them give me this kind food. Shey them go pay me bayi?"</p>

<p>The clip goes everywhere. Every comment is from someone who knows that feeling.</p>

<p>That video is not a joke. It is a structural failure compressed into six seconds.</p>

<p>The best beauty professionals in Lagos are not struggling because they lack skill. They are struggling because nothing around them can prove that skill to a stranger, protect their time, or guarantee they get paid.</p>

<h2>The People Nobody Can Find</h2>

<p>There is likely an excellent barber within a few streets of most people in Lagos. The referral chain will never reach them. Discovery is capped at the size of whoever's WhatsApp contacts happen to include the right person.</p>

<p>The dominant booking channel for independent stylists, MUAs, and barbers in Lagos is WhatsApp combined with Instagram DMs. There are no booking records, no confirmed appointments, no standardised pricing. A skilled professional working this way is, for practical purposes, invisible beyond their existing clients.</p>

<p>This is not a small inefficiency in a small market. Nigeria's hair care market alone is projected to reach $1.31 billion in 2024, growing at over 10% annually. Fashion and beauty is among the top four categories in Nigeria's informal economy by number of businesses. The demand is there. The pipeline to it is not.</p>

<h2>What a Booking Actually Costs a Stylist</h2>

<p>A client DMs a stylist. Price is negotiated informally. The appointment is confirmed on WhatsApp with no deposit and no paper trail. On the day, either side may cancel with no consequence to them.</p>

<p>If the client refuses to pay after a home visit, the stylist has spent between one and four hours in Lagos traffic, materials purchased out of pocket, and their skill, with no mechanism for recovery. A 2018 PayPal study found 58% of freelancers across four Southeast Asian markets had experienced non-payment. Nigeria, where 92% of the employed population works informally and gig work carries no legal protections, is unlikely to be better.</p>

<p>The power is not equal. If the stylist cancels, the client is inconvenienced. If the client refuses to pay after a home visit, the stylist absorbs the full cost. And because the relationship is informal, seeking any kind of recourse risks being seen as the difficult one.</p>

<div class="pull-quote"><p>"The income uplift came not from improving skill, but from attaching trust, visibility, and guaranteed payment infrastructure to the same skill."</p></div>

<h2>What India Showed About Infrastructure</h2>

<p>India had the same problem before Urban Company arrived. Skilled beauticians, no visibility, uncertain pricing, payment anxiety on both sides. The platform introduced verified profiles, in-app payment released after service completion, and ratings built from real completed jobs.</p>

<p>Third-party analysis found that Urban Company salon partners earn roughly four times more than offline beauticians doing the same work. The income uplift came not from improving skill, but from attaching trust, visibility, and guaranteed payment infrastructure to the same skill.</p>

<p>Talent was never the variable. Infrastructure was.</p>

<h2>What Vars Is Building in Lagos</h2>

<p>Vars connects Lagos stylists with clients for home service bookings. Clients pay through the platform before the visit. Payment is released to the stylist after the service is complete. Each stylist builds a verified profile with KYC checks and ratings earned from real completed jobs.</p>

<p>The barber in that video no longer has to wonder. The hairstylist who has been excellent at their craft for five years but invisible beyond their neighbourhood now has a profile anyone in Lagos can find, book, and pay through without a WhatsApp negotiation.</p>

<p>The market is large and the talent is there. What has been missing is the layer between them that makes trust transferable to a stranger. That layer is now being built.</p>`,
    related: ['the-culture-of-shame', 'why-nigerians-save-wrong', 'compounding-is-obvious'],
  },
  {
    slug: 'why-nigerians-save-wrong',
    title: 'Why Most Nigerians Save Wrong (And What To Do Instead)',
    cardTitle: 'Saving in naira is a slow leak.',
    gist: "Saving in naira while inflation runs at 30% isn't discipline. It's a slow leak.",
    category: 'Money & Investing',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '8 min read',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
    imageAlt: 'Finance',
    body: null,
    related: ['talent-without-trust', 'ajo-problem', 'compounding-is-obvious'],
  },
  {
    slug: 'bitcoin-only-hedge',
    title: "Bitcoin Isn't Magic. But It Might Be the Only Hedge That Makes Sense Here.",
    cardTitle: "Bitcoin is not magic. But it might be all you've got.",
    gist: "Not a prediction. A cold look at what crypto actually offers someone living in a devaluing currency.",
    category: 'Crypto',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '10 min read',
    image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1200&q=80',
    imageAlt: 'Crypto',
    body: null,
    related: ['talent-without-trust', 'ajo-problem', 'compounding-is-obvious'],
  },
  {
    slug: 'ajo-problem',
    title: "The Ajo Problem: Why Our Best Financial Tool Has No App",
    cardTitle: "Ajo is our best financial tool. Nobody talks about it.",
    gist: "Rotating savings circles predate every fintech startup. Why are we embarrassed by them?",
    category: 'Society',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '7 min read',
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=80',
    imageAlt: 'Lagos',
    body: null,
    related: ['the-culture-of-shame', 'talent-without-trust', 'compounding-is-obvious'],
  },
  {
    slug: 'family-tax-trap',
    title: "When Family Tax Becomes a Trap: Drawing a Line Without Burning It",
    cardTitle: "Family tax can kill your 30s.",
    gist: "Supporting family is noble. Doing it without a plan is how ambition dies quietly in your 30s.",
    category: 'Family',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '9 min read',
    image: 'https://images.unsplash.com/photo-1511895426328-dc8714191011?w=1200&q=80',
    imageAlt: 'Family',
    body: null,
    related: ['the-culture-of-shame', 'talent-without-trust', 'compounding-is-obvious'],
  },
  {
    slug: 'compounding-is-obvious',
    title: "Compounding Is Obvious. Why Don't More of Us Do It?",
    cardTitle: "Everyone knows compounding works. Nobody does it.",
    gist: "Everyone knows compound interest works. Something else is stopping us. It is not math.",
    category: 'The Long Game',
    author: 'Seyi Ibitoye',
    date: 'Coming soon',
    readTime: '6 min read',
    image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&q=80',
    imageAlt: 'Long game',
    body: null,
    related: ['the-culture-of-shame', 'talent-without-trust', 'ajo-problem'],
  },
];

export function getArticle(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
