# Wide Awake — Editorial Style Guide

> Read this before writing, editing, or transforming any blog post for Wide Awake.

---

## Voice

Wide Awake reads like a smart, unhurried friend who has thought carefully about something and is now thinking out loud with you. Not a lecturer. An observer.

**Delivery person:** Third-person conversational. The author (Seyi Ibitoye) is the editorial lens, not the subject. The perspective shows through what the piece notices and how it frames things — never through "I think" or "In my experience."

**Tone rules:**
- Direct. No hedging. No "perhaps" or "it could be argued."
- Nigerian context is assumed, not explained or justified.
- No performed positivity. Never "The amazing thing is..." or "Great news:"
- The reader is "you" — a peer, not a student.
- Observations, not opinions. "The thing about X is..." not "I believe X."

**What it sounds like:**
> "Most of us learned that silence early. We got so good at it we started calling it wisdom."

**What it does not sound like:**
> "In this article, I will explore the ways in which systemic pressures have impacted Nigerian intellectual expression."

---

## Delivery Strategy

1. **Open with a scene or contradiction.** Never with a thesis. The first paragraph drops the reader into a moment or an unexpected observation.
2. **The thesis surfaces in paragraph 3 or 4.** By then the reader already feels it.
3. **Section headings are complete thoughts,** not labels. ("The Cost of Being Right Out Loud" not "Consequences.")
4. **End with an action frame.** Something the reader can do differently. Not a summary.
5. **No listicles.** No bullet points in the article body.
6. **Length:** 600–1,200 words. Shorter is almost always better.

---

## Paragraph Rules

- 2–4 sentences per paragraph, maximum.
- One idea per paragraph.
- White space between paragraphs is intentional. Let the piece breathe.
- **Pull quote:** one per article, verbatim from the sharpest sentence in the piece. Wrap it in `<div class="pull-quote"><p>"..."</p></div>`.

---

## Grammar and Punctuation

- **No em dashes (—) or en dashes (–).** Replace with a colon (:) or break into a new sentence.
- British spelling throughout: colour, practised, recognise, favour.
- Oxford comma, always.
- Spell out numbers under 10. Numerals for 10 and above.
- Italics for emphasis (`<em>`), not bold. Bold for proper nouns and key terms only.

---

## Attribution

- `author` field in article data: always `'Seyi Ibitoye'`.
- No byline inside the body copy.
- The author's voice comes through the editorial lens: what the piece chooses to notice, how it frames things, which details it lingers on.
- Never: "Seyi writes..." or "according to the author..." or first-person "I."

---

## Persistent Elements (template-managed)

**The Gist** — top of every article.
- 1–2 sentences maximum.
- The sharpest, most compressed version of the thesis. Not a summary.
- Never starts with "In this article..."

**The Vars CTA block** — injected by the template just before the first `<h2>` in the body (after the intro paragraphs). No action needed per article; the template handles placement automatically.

**The Long Game callout** — bottom of every article, after comments.
- Generic copy is already baked into the template.
- Customise per article by editing the article object in `articles.ts` if a tighter connection to the piece is needed.

---

## Transforming External Content

When given a raw article or a link, follow this order:

1. Identify the core thesis — compress it into the **Gist** (1–2 sentences).
2. Find the best opening scene or contradiction in the piece — move it to paragraph 1.
3. Rewrite section headings as complete thoughts.
4. Break all paragraphs to 2–4 sentences. One idea each.
5. Replace every em dash and en dash. Colon or new sentence.
6. Strip first person. Reframe as third-person observational.
7. Remove all hedging language ("perhaps", "it could be argued", "I believe").
8. Write the pull quote — the single sharpest sentence.
9. Generate the image prompt (see below).
10. Add the article entry to `articles.ts`.

---

## Adding a New Article

Add a new entry to the `articles` array in `apps/landing/src/app/blog/articles.ts`:

```ts
{
  slug: 'your-slug-here',
  title: 'Article Title Here',
  gist: 'One or two sentences. The sharpest version of the thesis.',
  category: 'Mindset',
  // valid categories: Mindset | Money & Investing | Crypto | Society | Family | The Long Game | Vars
  author: 'Seyi Ibitoye',
  date: 'Month DD, YYYY',
  readTime: 'X min read',
  image: '/blog/your-slug-here.jpg',
  imageAlt: 'Short image description',
  body: `
    <p>...</p>
    <h2>Section heading as a complete thought</h2>
    <p>...</p>
    <div class="pull-quote"><p>"Sharpest sentence in the piece."</p></div>
    <p>...</p>
  `,
  related: ['slug-one', 'slug-two', 'slug-three'],
}
```

Body tag reference:
- `<p>` — paragraph
- `<h2>` — section heading
- `<h3>` — sub-heading (use sparingly)
- `<em>` — italics / emphasis
- `<div class="pull-quote"><p>"..."</p></div>` — pull quote block

---

## Hero Image Prompt

Each article carries an `imagePrompt` field in `articles.ts`. Use this template when writing one:

```
Wide Awake blog hero. Editorial documentary photograph. [SCENE: 1–2 sentences describing exactly what is in the frame, grounded in the article's core idea]. Natural light. Nigerian urban environment where contextually appropriate. No text, no logos, no graphic overlays, no stock-photo staging. Unposed. Photorealistic. 16:9 aspect ratio. Mood: [2–3 words].
```

**Worked example** for "The Nigerian Mind Was Never Broken. It Was Locked.":

```
Wide Awake blog hero. Editorial documentary photograph. A young Nigerian man seated at a cluttered desk, papers in front of him, looking sideways out of a window — mid-thought, not posing. Natural window light from the left. No text, no logos, no staging. Unposed. Photorealistic. 16:9 aspect ratio. Mood: contemplative, quiet, still.
```

**Where to save the generated image:**
1. Export at 1200px wide minimum. Save as `apps/landing/public/blog/[slug].jpg`.
2. In `articles.ts`, update the `image` field from the Unsplash placeholder URL to `/blog/[slug].jpg`.
3. Done. The article template picks it up automatically via `article.image`.
