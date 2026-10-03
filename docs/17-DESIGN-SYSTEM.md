# 17 - Design System

**Purpose.** The visual and interaction contract that implementation follows. This doc owns the layer above `07-UI-UX-SPEC.md` (aesthetic direction, typography, surface language, composition, motion, iconography) and the layer below it (token architecture, the shadcn integration policy, component inventory, accessibility mechanics, quality gates).

**Normative parents.** [`../AGENTS.md`](../AGENTS.md) (C1-C8, section 5.1, section 5.3, section 5.4), [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) (authority on screens, state kinds, content classes, core token values), [`01-DECISIONS.md`](01-DECISIONS.md) (decision ids), [`15-GLOSSARY.md`](15-GLOSSARY.md) (vocabulary).

**Boundary.** `07` already owns the screen inventory, the per-screen state tables, the five state kinds, the five content classes with their badge strings, and the core token hex values. None of that is restated here. Where this doc needs a value that `07` fixes, it uses `07`'s value and cites the section. Where this doc proposes a different value, the proposal is named as a proposal in section 14 and is not applied until `07` is amended.

**Status.** `app/` does not exist yet. Every path in this doc is the path the first build task must create.

---

## 1. Aesthetic direction: Institutional Editorial

### 1.1 The claim the interface has to carry

The product's credibility rests on one claim: **the original assignment brief is authoritative, and the AI's interpretation is clearly not.** Constraint C2 and decisions D17 and D18 make that claim about content; the interface has to make it about appearance, because a reader forms the truth judgement before reading a sentence.

That produces a hard requirement. The product cannot look like an AI product. If it does, the reader reasonably infers that the distinction between the brief and the interpretation is cosmetic, and the one thing the product is built to guarantee reads as marketing. The interface is therefore not decoration over a guardrail; it is the visible half of the guardrail.

**Direction: Institutional Editorial.** A university-press sensibility with engineering-document precision. Documents are documents: framed, page-anchored, sourced, on paper. Interpretation is annotation: badged, dashed, tinted, plainly attached to the thing it interprets and never mistaken for it.

### 1.2 What it is explicitly not

| Rejected | Why it undermines the claim |
|---|---|
| Generic SaaS layout (hero, feature grid, card soup) | Reads as a startup product, so its content reads as generated marketing text. |
| Purple-on-white or indigo gradients | The visual signature of the category this product differentiates itself from (D2). |
| Rounded everything | A 16px radius on a document panel says "app surface". A document has corners. |
| Glassmorphism, backdrop blur, translucent panels | Blur implies layering and softness; the product's argument is about crisp, checkable provenance. |
| Default Tailwind and default shadcn appearance | The strongest possible signal that no design decision was made, which invites the inference that no content decision was made either. |
| Illustration, mascots, emoji chrome | Tone that contradicts the integrity argument; `07` section 2.7 already bans emoji in product chrome. |

### 1.3 Design principles

1. **A document is a sheet; an interpretation is an annotation.** The frame, the grain, and the page anchor are reserved for T1. The dashed rule, the tint, and the badge are reserved for T5. Neither vocabulary is borrowed by the other.
2. **Authority is typographic.** The serif family appears only where the text is authored by a human or is a verbatim excerpt of an official document. A serif paragraph of AI interpretation is a C2 defect expressed as a font choice.
3. **Structure is visible before content is.** Every panel states what it is (badge, source label, tier) in its first line, at every breakpoint, before its body is read.
4. **Flat by default, elevated only when floating.** Content panels carry no shadow. Shadow means "this is not part of the page" and is reserved for overlays.
5. **No state depends on colour.** This is `07` section 2.1 rule 1 and the greyscale test in `07` section 2.2 rule 6; this doc supplies the border styles, type treatments, and badges that satisfy it (`07` section 2.2 fixes the styles; this doc fixes how they are built).
6. **Calm is a feature.** No motion carries meaning, no number animates, no surface competes with the document. The interface's job is to be out-read by the brief.

### 1.4 DFII score

`DFII = (Aesthetic Impact + Context Fit + Implementation Feasibility + Performance Safety) - Consistency Risk`, each component 1-5, target >= 8.

| Component | Score | Reasoning |
|---|---|---|
| Aesthetic Impact | 5 | The sheet-versus-annotation grammar is specific and memorable; it is not reachable by leaving a component library at its defaults. |
| Context Fit | 5 | The direction is derived directly from C2, D17, and D18. The visual argument and the product argument are the same argument. |
| Implementation Feasibility | 4 | Self-hosted families and the 24 hand-built primitives in 7.3 cost build time. Not 5 because the shadcn adopt list (7.2) covers the interaction-heavy components (Dialog, Select, Command, Toast), which is where hand-building usually blows a 48-hour budget. |
| Performance Safety | 4 | Paper grain is one tiled data URI with no animation; fonts are seven committed woff2 files with three preloads. Not 5 because a committed italic for two families and a committed weight for three families is real bytes (budget and gate in 2.3 and G8). |
| Consistency Risk | 2 | Two live risks: shadcn defaults leaking through a component adopted without re-theming, and the serif/sans discipline eroding under deadline pressure. Both are gated (G2, G5, G10) but neither is self-enforcing. |
| **DFII** | **16** | (5 + 5 + 4 + 4) - 2 = 16, above the target of 8. |

Consistency Risk is reported honestly rather than minimised: it is the only component a reviewer cannot check from a screenshot, and it is the component that decays in the last six hours of a build.

---

## 2. Typography

`07` section 2.3 fixes sizes (body 15px/1.5, tight 14px/1.45, heading-1 28px/1.25, heading-2 20px/1.3, heading-3 16px/1.4, badge 11px uppercase letter-spacing 0.06em weight 600, mono 13px/1.5) and specifies no families. Families are this doc's decision, and choosing them does not alter any `07` token.

### 2.1 The three families

| Role | Family | Why this family |
|---|---|---|
| Display and document-facing | **Newsreader** | A variable serif designed for sustained on-screen reading, with an optical-size axis (`opsz` 6-72) so one family covers a 40px masthead and a 15px caption without a second display face. Its higher stroke contrast at display sizes reads as a university press setting a title, not as a web page setting an h1. Its italic is drawn rather than slanted, which matters for `AuthorityQuote` and the document caption. SIL OFL 1.1. |
| UI and body | **IBM Plex Sans** | Humanist with open apertures, which holds at 11-15px where most of this interface lives (badges, table cells, dense tutor rows). It has a genuine monospace sibling in the same skeleton, so ids and prose share optical weight on one line. Its italic is drawn. Square-cut terminals read as engineering documentation rather than consumer software. Has native tabular figures, which the Assignment Health table and the Checklist counts need. SIL OFL 1.1. |
| Mono: ids, timestamps, request ids, pseudonyms, page references | **IBM Plex Mono** | Same skeleton and metrics as Plex Sans, so `Anonymous Student #482` sits on the same rhythm as the prose around it. Mono also does semantic work: a pseudonym set in mono reads as a record identifier rather than a person, which supports D26 and C4 (`07` section 6.3). SIL OFL 1.1. |

**Alternative considered for the display role: Source Serif 4.** It is a genuinely good answer, more neutral, and closer to a print body face. It is not chosen because its neutrality is the point of it, and at 40px it reads as "the tasteful default serif", which is a weaker signal than the direction needs. It also has no optical-size axis, so a masthead and a caption would have to be hand-tuned. If Newsreader is rejected for any reason, Source Serif 4 is the substitute and the rest of this doc stands unchanged.

**Families rejected outright:** Inter (the visual signature of the category, section 1.2), Roboto, Arial, and `system-ui` as a primary. These are banned at any position in a font stack, including as a fallback, so that a stack cannot silently degrade into the generic look.

### 2.2 The ban and how it is stated

1. No font stack in the shipped application may contain Inter, Roboto, Arial, or `system-ui`.
2. Every stack begins with a `next/font` CSS variable, and its fallbacks are metric-similar and universally present:
   - `--font-editorial: var(--font-newsreader), Georgia, "Times New Roman", serif;`
   - `--font-ui: var(--font-plex-sans), "DejaVu Sans", Verdana, sans-serif;`
   - `--font-mono: var(--font-plex-mono), "DejaVu Sans Mono", Consolas, monospace;`
3. Tailwind's default `fontFamily` theme keys are **replaced**, not extended, so `font-sans` resolves to `--font-ui` and no `font-sans` class can fall through to Tailwind's default stack.

### 2.3 Self-hosting with `next/font`, and why it is not a CDN

The demo must run with no network (`11` WP-01 acceptance: with `LLM_PROVIDER=mock`, the app boots offline; `12` section 8 requires the demo script to have been run once with the network off). A runtime font CDN would break that, and `next/font/google` fetches at **build** time, which makes a clean checkout or a CI build network-dependent.

The chosen path is `next/font/local` with the woff2 files committed:

```ts
// app/src/styles/fonts.ts
// Constraint: no network at build time or at run time. The files are committed.
// Only the weights the type scale uses are shipped; 500 is not requested anywhere.
import localFont from "next/font/local";

export const editorial = localFont({
  src: [
    { path: "./fonts/newsreader-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/newsreader-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/newsreader-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  preload: true,
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const ui = localFont({
  src: [
    { path: "./fonts/plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-sans-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/plex-sans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["DejaVu Sans", "Verdana", "sans-serif"],
});

export const mono = localFont({
  src: [{ path: "./fonts/plex-mono-400.woff2", weight: "400", style: "normal" }],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: "Courier New",
  fallback: ["DejaVu Sans Mono", "Consolas", "monospace"],
});
```

`adjustFontFallback` takes a metric-override target name used only inside `next/font`'s generated `@font-face` descriptor; it is never rendered and is not in any stack, so the ban in 2.2 is unaffected. If a reviewer prefers zero mentions of those family names anywhere in the source, drop `adjustFontFallback` and accept a slightly larger layout shift.

Requirements:

1. Latin subset only. No CJK, Cyrillic, Greek, or Vietnamese subsets are committed or requested.
2. Seven woff2 files total. Total committed payload **<= 190 KB**, measured in the build gate (`G8`). A new weight is a design-system change, not a component change.
3. `preload: true` for the two families that paint above the fold (Newsreader, Plex Sans); `false` for Plex Mono, which appears inside content.
4. `OFL.txt` for each family is committed beside the woff2 files. OFL 1.1 permits redistribution and requires the licence to travel with the font.
5. `font-display: swap` everywhere. A blocked font must never hide the brief: the document viewer's page images are the content and they render independently of the webfont.
6. No `@import` of a font stylesheet anywhere. `G5` fails a build that references `fonts.googleapis.com` or `fonts.gstatic.com`.

### 2.4 Type scale

Every role in one table. The `07` column names the token this row implements, or `new` when this doc adds a token; added tokens do not rename or remove any token in `07` section 2.3.

| Token | Family | Size / line-height | Weight | Tracking | Use | `07` |
|---|---|---|---|---|---|---|
| `display-1` | Newsreader | 40px / 1.10 | 600 | -0.015em | Publication masthead: the Publish dialog title, the sign-in wordmark | new |
| `display-2` | Newsreader | 30px / 1.15 | 600 | -0.010em | Screen masthead: Add assignment, Review assignment, Assignment Health | new |
| `heading-1` | Newsreader | 28px / 1.25 | 600 | -0.005em | Page heading | 2.3 |
| `heading-2` | Newsreader | 20px / 1.30 | 600 | 0 | Section heading, including a content-class panel header | 2.3 |
| `heading-3` | IBM Plex Sans | 16px / 1.40 | 600 | 0 | Panel and card heading, Milestone group header | 2.3 |
| `doc-body` | Newsreader | 17px / 1.60 | 400 | 0 | Verbatim excerpt inside `AuthorityQuote` only. Never AI prose | new |
| `doc-caption` | Newsreader italic | 15px / 1.50 | 400 | 0 | Source caption beneath an official page | new |
| `body` | IBM Plex Sans | 15px / 1.50 | 400 | 0 | Default reading size, post bodies, assistant turns | 2.3 |
| `tight` | IBM Plex Sans | 14px / 1.45 | 400 | 0 | Dense rows, helper text, Query row metadata | 2.3 |
| `ui-sm` | IBM Plex Sans | 13px / 1.45 | 400 | 0 | Tutor table cells, secondary metadata, filter labels | new |
| `badge` | IBM Plex Sans | 11px / 1.20 | 600 | 0.06em | All badges, uppercase. The floor for badge size | 2.3 |
| `mono` | IBM Plex Mono | 13px / 1.50 | 400 | 0 | Request ids, source filenames, `Source:` labels, page references | 2.3 |
| `mono-sm` | IBM Plex Mono | 12px / 1.40 | 400 | 0.01em | `Anonymous Student #N`, timestamps, elapsed time | new |
| `metric` | IBM Plex Sans, `tnum` | 24px / 1.20 | 600 | -0.010em | Assignment Health headline figures. Never animated (10.6) | new |

Typography rules:

1. **Weights are 400 and 600 only.** Weight 500 is not shipped. A design that needs a mid-weight is solved with colour or a border, not with a font file.
2. **Measure.** Serif running text is capped at 68 characters; sans running text at 72. The `AuthorityQuote` block is capped at 60.
3. **Figures.** Any column of numbers, the resolution rate, and the Checklist count use `font-variant-numeric: tabular-nums`. Numbers in prose are proportional.
4. **Casing.** Uppercase is reserved for the `badge` role and for `display-1` when it renders the product name. A sentence in uppercase is a defect.
5. **Quotation.** Straight ASCII quotes only, per `AGENTS.md` section 5.3. Verbatim excerpts keep the source's own punctuation inside the quote, and the quote is never re-punctuated to fit the surrounding sentence.
6. **The serif never sets AI interpretation prose, peer prose, or control labels.** The containment rule is gated (`G10`).
7. **Truncation.** A content-class badge is never truncated and never ellipsised (`07` section 2.2 rule 1). It may wrap to two lines at `sm`; `text-overflow: ellipsis` is banned on any element carrying `data-content-class`.

---

## 3. Colour, surface, and texture

### 3.1 What colour is allowed to mean

The five content-class colours in `07` section 2.3 are load-bearing: they encode truth tier. They are not adjusted here, and no new colour may be introduced that competes for the same meaning.

| Colour job | Owned by | Rule |
|---|---|---|
| Truth tier (T1-T5) | `07` section 2.2 and 2.3 | Fixed. Border style carries the tier as much as hue does; hue never carries it alone. |
| Primary action and institutional ink | This doc, primitive layer | One deep navy derived from `--accent-official #1F4E79`. Primary buttons, the solid T1 frame, and application chrome. |
| Background and paper | This doc, primitive layer | A neutral application background at `07`'s value, and a warm paper substrate used **only inside T1 surfaces**. See 3.4 and 14. |
| Attention | `--accent-interpretation #B54708` | The only amber in the product. It means "AI interpretation, requires approval". It is never used for a form error or a call to action, because reusing it would devalue the tier signal. Where `--state-warning` shares the hex, the two are distinguished by context: a warning appears in an operational panel, never inside a content-class frame. |
| Feedback states | `07` section 2.3 `--state-*` | Errors use `--state-error`, never amber. |

### 3.2 Primitive ramp (layer 1)

Primitives carry no meaning. They exist so a semantic value is a mapping, not a hex literal in a component.

```css
/* app/src/styles/tokens.css - layer 1 only. No component reads this layer. */
@layer tokens {
  :root {
    /* ink - the institutional navy family, anchored on 07's --accent-official */
    --p-ink-950: #0B1F33;
    --p-ink-800: #1F4E79;   /* 07 --accent-official / --border-official */
    --p-ink-700: #2C6499;
    --p-ink-200: #B9CFE3;
    --p-ink-100: #DCE7F1;

    /* paper - neutral application surface plus the warm substrate for T1 */
    --p-paper-000: #FFFFFF;
    --p-paper-050: #FAF9F7;  /* warm mat; T1 document substrate only */
    --p-paper-100: #F5F3EF;
    --p-paper-200: #ECE8E1;  /* warm hairline for T1 internals */
    --p-page-050:  #F7F8FA;  /* 07 --surface-page, unchanged */

    /* amber - attention, meaning "AI interpretation" */
    --p-amber-050: #FFFBF0;
    --p-amber-200: #F7E3C8;
    --p-amber-700: #B54708;  /* 07 --accent-interpretation */

    /* green - tutor authority */
    --p-green-050: #F6FEF9;
    --p-green-700: #027A48;

    /* slate - text and structural greys */
    --p-slate-900: #101828;
    --p-slate-600: #475467;
    --p-slate-500: #667085;  /* proposed --border-peer replacement; see 3.6 and 14 */
    --p-slate-400: #98A2B3;  /* current 07 --border-peer; fails 3:1; see 3.6 */
    --p-slate-300: #D0D5DD;

    /* states */
    --p-red-700:  #B42318;
    --p-blue-700: #175CD3;
  }
}
```

### 3.3 Semantic layer (layer 2) is `07` section 2.3

Layer 2 is `07` section 2.3, name for name, value for value. This doc adds four semantic tokens that `07` does not name, each mapped to a primitive, and changes nothing else:

| New semantic token | Value | Purpose |
|---|---|---|
| `--surface-document-mat` | `var(--p-paper-050)` | The substrate behind a rasterised official page, inside a T1 frame. The frame surface itself remains `--surface-official` (#FFFFFF). |
| `--surface-document-edge` | `var(--p-paper-200)` | Warm hairline for the page image edge and the viewer's page-separator rules. |
| `--focus-ring-width` | `2px` | Implementation of `07`'s `--focus-ring`, so no component hard-codes it. |
| `--focus-ring-offset` | `2px` | Implementation of `07`'s 2px offset. Load-bearing, not cosmetic: see 3.6 and 11.1. |

`07` section 2.3 states that hex values "may be tuned without changing this doc's structure". This doc therefore treats the **names** in `07` section 2.3 as immutable and the **values** as owned by `07`. Section 14 lists the value changes this doc would make if it owned them, and does not make them.

### 3.4 Paper grain, on T1 surfaces only

The grain exists for one reason: an official brief should read as a physical document that was uploaded, not as a web page that was generated. It is applied to the T1 `ContentClassPanel` and to nothing else.

```css
/* app/src/styles/texture.css
   Constraint: exactly one selector applies the grain (gated by G9).
   A data URI costs no request, is decoded once, and tiles from cache.
   No animation, no filter on an ancestor, no will-change. */
[data-content-class="official"] {
  position: relative;
  isolation: isolate;
}

[data-content-class="official"]::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.035;
  mix-blend-mode: multiply;
  background-repeat: repeat;
  background-size: 120px 120px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* The grain is a screen affordance, not part of the document. */
@media print {
  [data-content-class="official"]::before { display: none; }
}
```

Performance and correctness notes:

1. **Data URI, not a committed PNG and not an inline `<svg>` element.** A data URI is a compile-time constant in the stylesheet, so it is one cached image resource regardless of how many T1 panels are mounted. A DOM `<svg>` with `feTurbulence` is re-parsed and re-filtered per mount, and a PNG is a second network request with a fixed colour cast that cannot adapt.
2. **`position: absolute` inside a `position: relative` panel**, with `pointer-events: none`, so the layer never participates in hit testing and never affects layout. It must not be implemented as `background-attachment: fixed`, which forces a repaint on scroll.
3. **No `filter` or `backdrop-filter` on the panel or any ancestor.** A filter creates a containing block and promotes the layer, which turns a static tile into per-frame compositing on the largest surface in the workspace.
4. **Opacity is capped at 0.035.** Above roughly 0.06 the grain visibly mottles the rasterised page image and starts to interfere with small text. The effect on the underlying contrast pair is verified on the composited screenshot, not on the token values (`G7`).
5. **`isolation: isolate`** keeps the multiply blend inside the T1 panel, so the grain cannot darken the page background through the panel's own border radius.
6. **The grain is never applied to T5.** An amber-tinted panel with grain would make interpretation look like a document, which is the exact confusion C2 exists to prevent.
7. **One T1 panel per view is the design intent.** The viewer shows one document at a time; where a screen stacks two T1 panels (the review screen's materials list beside its artifacts), only the panel is grained, not each row.

### 3.5 Elevation, border, and radius language

Decision: **keep `07`'s radius scale and shadow token, and restrict where they apply.** Changing 6px to 3px buys nothing a reviewer can see; restricting shadow does.

| Property | Value | Applies to | Never |
|---|---|---|---|
| Radius `sheet` | **2px** (new) | T1 and T5 content frames, the document page image, `AuthorityQuote` | Buttons, inputs |
| Radius `card` | **6px** (`07`) | Dashboard course and assignment cards, tutor table container | Any content-class frame |
| Radius `control` | **4px** (`07`) | Buttons, inputs, selects, badges, chips | Cards |
| Radius `overlay` | **6px** (`07`) | Dialog, popover, sheet, dropdown, tooltip | Content |
| Radius `full` | 9999px | Avatars and the Assistant floating action button only | Anything else |
| Shadow `--shadow-card` | `0 1px 2px rgba(16,24,40,0.06)` (`07`) | Cards, and only cards | Content-class frames |
| Shadow `--shadow-overlay` | **new**: `0 8px 24px rgba(16,24,40,0.12), 0 1px 2px rgba(16,24,40,0.08)` | Dialog, popover, sheet, dropdown, the Assistant panel when it floats | Anything in the document flow |
| Border `hairline` | `1px solid var(--border-default)` | Structural dividers, table rules, card edges | Truth-tier boundaries |
| Border `tier` | `07` section 2.3, per class | The five content classes, always as specified in `07` section 2.2 | Decorative use anywhere |

Three rules make this enforceable:

1. **A content-class frame is flat.** No shadow, 2px radius, 1px border, and the 4px left rule. This is what makes a T1 panel read as a sheet rather than a floating card, and it is the cheapest single move in the whole direction.
2. **Elevation means "not part of the page".** If an element casts a shadow and the user cannot dismiss it, the shadow is wrong.
3. **Borders carry meaning or they carry nothing.** A border that separates content is decorative and may be `--border-default` (1.47:1). A border that distinguishes one truth tier from another is meaningful and must reach 3:1 (see 3.6).

### 3.6 Contrast measurements, and the token that fails

Ratios are computed with the WCAG 2.1 relative-luminance formula. Minimums: 4.5:1 for text below 18.66px bold or 24px regular, 3:1 for meaningful non-text boundaries and graphical objects (`07` section 2.7).

| Pair | Ratio | Verdict |
|---|---|---|
| `--text-primary` #101828 on `--surface-interpretation` #FFFBF0 | 17.16:1 | Pass |
| `--text-primary` #101828 on `--surface-page` #F7F8FA | 16.70:1 | Pass |
| `--text-inverse` #FFFFFF on `--accent-official` #1F4E79 | 8.66:1 | Pass |
| `--text-secondary` #475467 on `--surface-interpretation` #FFFBF0 | 7.44:1 | Pass |
| `--text-secondary` #475467 on `--surface-page` #F7F8FA | 7.24:1 | Pass |
| `--accent-interpretation` #B54708 on `--surface-interpretation` #FFFBF0 | 5.25:1 | Pass (11px badge and T5 prose) |
| `--accent-interpretation` #B54708 on `--surface-card` #FFFFFF | 5.43:1 | Pass |
| `--accent-interpretation` #B54708 on `--surface-page` #F7F8FA | 5.11:1 | Pass |
| `--accent-interpretation` #B54708 on `--surface-document-mat` #FAF9F7 | 5.16:1 | Pass |
| `--accent-interpretation` #B54708 on `--surface-approved` #F6FEF9 | 5.29:1 | Pass |
| `--text-inverse` #FFFFFF on `--accent-interpretation` #B54708 | 5.43:1 | Pass (solid amber control) |
| `--accent-approved` #027A48 on `--surface-approved` #F6FEF9 | 5.27:1 | Pass |
| `--border-approved` #027A48 on #FFFFFF | 5.41:1 | Pass (meaningful boundary) |
| `--border-interpretation` #B54708 on #FFFFFF | 5.43:1 | Pass (meaningful boundary) |
| `--focus-ring` `--state-info` #175CD3 on #FFFFFF | 5.99:1 | Pass |
| `--focus-ring` #175CD3 on `--surface-page` #F7F8FA | 5.64:1 | Pass |
| `--focus-ring` #175CD3 on `--surface-interpretation` #FFFBF0 | 5.79:1 | Pass |
| `--border-default` #D0D5DD on #FFFFFF | 1.47:1 | Decorative divider only; permitted, never the sole cue |
| `--border-peer` #98A2B3 on #FFFFFF | **2.58:1** | **Fail.** Below the 3:1 required for a meaningful boundary |

**The failing token is `--border-peer #98A2B3`.** It is load-bearing: `07` section 2.2 gives T4 a 1px dotted border, and the greyscale test in `07` section 2.2 rule 6 relies on that border being perceivable with colour removed. At 2.58:1 against white it is not reliably perceivable, so the test it is supposed to satisfy can fail for low-vision users even while it passes for a screenshot reviewer. The replacement primitive is `--p-slate-500 #667085`, measured at **4.98:1** on white and 4.68:1 on `--surface-page`. This doc does not change the value, because `07` owns it; the amendment is proposed in section 15 and `G7` fails a build that ships the failing pair on a meaningful boundary.

**Where the amber risk actually is.** The amber token itself is safe against every surface in `07` section 2.3 (5.11:1 to 5.43:1), so the risk is not the token pair. It is three treatments built on top of it:

1. **Opacity-based de-emphasis.** Amber at 60% opacity for a disabled state measures roughly 2.6:1 against the tint. Disabled controls must swap tokens (a `--text-secondary` label on a neutral surface), never reduce opacity on a coloured one.
2. **The 11px badge.** 5.25:1 clears the 4.5:1 text minimum with margin, but 11px uppercase at weight 600 is the smallest text in the product. It must never shrink below 11px, never drop below weight 600, and never be rendered on a surface other than the four measured here.
3. **New surfaces.** Any future dark, photographic, or coloured surface invalidates all of the above. Adding one is a design-system change with a new measurement table, not a component change.

The same three risks apply to the solid `--accent-interpretation` control, which is 5.43:1 with white text.

**The focus ring needs its offset.** `--state-info` measures 1.45:1 against `--accent-official`, so a 2px ring drawn flush against a navy primary button would not be perceivable against that button. `07`'s 2px offset puts the ring against the page surface instead, where it measures 5.64:1 to 5.99:1. The offset is a contrast mechanism, and the ring must never be drawn inset for a tidier look.

---

## 4. Spatial composition

### 4.1 Grid, gutters, and rhythm

| Breakpoint | Columns | Gutter | Page margin | Notes |
|---|---|---|---|---|
| `sm <640` | 1 | 16px | 16px | Tabs become a scrollable segmented control (`07` section 2.7). The Assistant is a bottom sheet. |
| `md 640-1023` | 8 | 20px | 24px | Two-column only for the review screen and the Query thread. |
| `lg >=1024` | 12 | 24px | 32px | Full layout. The Assistant is a right side panel; the workspace narrows rather than overlaying. |
| `xl >=1440` | 12, capped | 24px | auto | The content column is capped at 1200px and centred. |

Vertical rhythm uses `07`'s space scale (4 8 12 16 24 32 48) only:

1. 24px between sibling blocks inside a panel.
2. 32px between sections inside a tab.
3. 48px between the three major regions of the Assignment/Info tab (official documents, Assignment Map, published AI Usage Policy), in the order `07` section 4.2 fixes.
4. A content-class frame's internal padding is 16px at `sm`, 20px at `md`, 24px at `lg`. The left rule sits outside the padding, so text never touches the truth-tier border.

### 4.2 Reading measure and the document

Serif running text is capped at 68 characters and sans at 72 (2.4 rule 2), and the `AuthorityQuote` block at 60. The document viewer is the exception and has no measure of its own: the rasterised page image sets its own measure, and the viewer's job is to present it without competing (`07` section 4.2 rule 7). The viewer's chrome (badge, `Source:` label, page indicator, navigation) is `badge` or `mono` at all times, so no chrome element is ever the same size and weight as document content.

### 4.3 The document/annotation split

Layout order inside the Assignment/Info tab is fixed by `07` section 4.2 (viewer, then Map, then policy card). This doc adds the spatial treatment that makes the order read as an argument rather than a stack:

1. The T1 viewer occupies the full content width and is the first thing painted. It is not inside a collapsible, a tab-within-a-tab, or a card that could be mistaken for a widget.
2. The T5 Map begins below it, inset by 16px on both sides at `lg`, so its dashed left edge sits inside the T1 frame's solid left edge. The visual message is containment: interpretation is subordinate, and the inset makes it structural rather than stated.
3. The inset is never reversed. A T5 panel is never wider than, or above, a T1 panel.
4. At `sm` the inset is removed (the width is not there to spend), and subordination is carried by the badge, the dashed rule, and the reading order alone.

### 4.4 Density on tutor surfaces

Tutor surfaces carry more data per screen than student surfaces, and the temptation is to shrink type. Rules:

1. Density comes from `tight` and `ui-sm`, never from a smaller `body` or a reduced line-height.
2. Table rows are 44px tall minimum on the two densest tables (the review artifact list and the Assignment Health milestone table), so the row is a target (`07` section 2.7).
3. The Assignment Health table never wraps a numeric cell. It scrolls horizontally inside a `ScrollArea` at `sm` rather than compressing columns below `ui-sm`.
4. The review screen is a two-column split: uploaded materials at 5 columns, artifact list at 7, at `lg` and above. `07` section 7.3 rule 9 requires the materials panel to be visible beside the artifacts; at `md` and below the materials panel becomes a sticky summary bar above the list rather than a separately navigable page.

---

## 5. The differentiation anchor: the T1/T5 authority grammar

### 5.1 The recognition test

**Remove the logo and the product name from any screenshot of the student workspace. It must still be identifiable as this product, because exactly one solid navy frame containing a page-imaged document with a visible paper grain and a mono `Source:` label sits in the same view as exactly one dashed, amber-tinted panel carrying a full-width badge that says the content is AI-generated and not the official requirement.**

Nothing else in the interface is permitted to produce that combination, and no other product in the category produces it. It is a two-element signature: the solid T1 sheet and the dashed T5 annotation, visible together, with the badge legible.

The test is checkable three ways: a screenshot with the header cropped (a human procedure), a DOM assertion that the Assignment/Info tab renders both an official and an interpretation panel with the grain selector applied to the first and a complete badge on the second (`G9`, `G3`), and the greyscale screenshot test (`G1`).

### 5.2 The grammar, axis by axis

| Axis | T1 official document | T5 AI interpretation |
|---|---|---|
| Border style | `1px solid var(--border-official)` | `1px dashed var(--border-interpretation)` |
| Left rule | 4px **solid** `--border-official` | 4px **dashed** `--border-interpretation` |
| Surface | `--surface-official` #FFFFFF, with `--surface-document-mat` behind the page and 3.5% paper grain | `--surface-interpretation` #FFFBF0, flat, no grain |
| Corner radius | 2px (`sheet`) | 2px (`sheet`) |
| Elevation | none | none |
| Badge | **none.** `07` section 2.2 forbids an AI badge on T1 | Full-width badge, sticky in the Map panel, exact string from `07` section 2.2 and 2.5, never truncated |
| Header typography | `heading-2` Newsreader, plus a `mono` `Source: <filename>, page <n>` line below it, left-aligned | Badge first (`badge`, uppercase), then `heading-3` IBM Plex Sans or body prose. Serif appears only inside a nested `AuthorityQuote` |
| Page anchor | A visible page frame with the page number in `mono`, and `Source: <filename>, page <n>` above the page | No page frame. A `From the brief, page <n>` link and a `SourceLink` instead |
| Verbatim text | The page image itself | A quoted block: `doc-body` Newsreader inside `AuthorityQuote`, capped measure, labelled `From the brief, page <n>`, inset, with a `--surface-document-edge` left hairline so the reader can see where the T1 quote starts and the T5 panel resumes (`07` section 2.2 rule 3) |
| What it may contain | Only the uploaded document, rendered as an image. Never re-flowed, never summarised | Interpretation, structure, navigation, provenance. Never a requirement stated as if it were the brief |
| Icon | none | none. The badge and the border carry the meaning; an icon would add a third redundant cue |

The two treatments deliberately share three properties: the 2px radius, the absence of elevation, and the absence of an icon. Shared geometry is what makes the pair read as one page in two registers rather than two unrelated widgets. The properties that differ are exactly the ones that encode authority.

### 5.3 Wireframe: one requirement and its T5 interpretation

```text
+---------------------------------------------+  +---------------------------------------------+
| Original assignment brief                   |  | AI GENERATED - REQUIRES TUTOR APPROVAL      |
| Source: COSC1234_Assignment_A.pdf           |  | AI-GENERATED INTERPRETATION - NOT THE        |
|                                             |  | OFFICIAL REQUIREMENT                         |
| +-----------------------------------------+ |  | Refer to the original brief for exact        |
| | 1px SOLID #1F4E79                        | |  | requirements.                                |
| | 4px SOLID left rule                      | |  |                                              |
| | warm paper mat + 3.5% grain              | |  | +------------------------------------------+ |
| |                                          | |  | | 1px DASHED #B54708                       | |
| |   page 4 of 12                 [ mono ]  | |  | | 4px DASHED left rule                     | |
| |                                          | |  | | flat #FFFBF0, no grain, no shadow        | |
| |   2. Submission                          | |  | |                                          | |
| |   [ rasterised page image,               | |  | | Requirement 1  Deliverable and submission | |
| |     document's own typography,           | |  | | format                         Brief p.4   | |
| |     document's own measure ]             | |  | |                                          | |
| |                                          | |  | | Verbatim, quoted from the brief:         | |
| |                                          | |  | | +--------------------------------------+ | |
| |                                          | |  | | | "Submit one file only."              | | |
| |                                          | |  | | |  doc-body, Newsreader, 60ch measure  | | |
| |                                          | |  | | +--------------------------------------+ | |
| |                                          | |  | | From the brief, page 4                   | |
| +-----------------------------------------+ |  | |                                          | |
|                                             |  | | Summary: one submission artefact, no      | |
| [ < Previous ]    4 / 12    [ Next > ]      |  | | archive, no separate report.              | |
|                                             |  | +------------------------------------------+ |
+---------------------------------------------+  +---------------------------------------------+
  T1  authoritative. verbatim. framed. grained.    T5  advisory. badged. dashed. dead flat.
      serif header. mono source. page-anchored.        sans prose. serif only inside the quote.
```

At `sm`, the two panels stack and both keep their full treatment; only the T5 side inset is dropped:

```text
+-----------------------------------+
| AI GENERATED - REQUIRES TUTOR     |   <- badge wraps to two lines, is not shortened
| APPROVAL                          |
| AI-GENERATED INTERPRETATION - NOT |
| THE OFFICIAL REQUIREMENT          |
| Refer to the original brief for   |
| exact requirements.               |
|-----------------------------------|
| +------------------------------+  |
| | "Submit one file only."      |  |
| +------------------------------+  |
| From the brief, page 4            |
+-----------------------------------+
```

Two things a reviewer checks here, both defects if absent: the badge is complete (not abbreviated to "AI GENERATED"), and the quoted verbatim text is visibly inside the T5 frame rather than presented as the T5 frame's own claim.

---

## 6. Token architecture

### 6.1 Three layers, one direction

```text
L1 primitive      --p-ink-800: #1F4E79;
                  raw value, no meaning, one file, referenced only by layer 2
                        |
                        v
L2 semantic       --border-official: var(--p-ink-800);
                  meaning. THIS LAYER IS 07 SECTION 2.3, name for name.
                  Components and Tailwind theme keys read only this layer.
                        |
                        v
L3 component      --content-frame-rule: 4px;
                  scoped to one primitive, declared beside the component,
                  never exported and never global.
```

Rules:

1. **One direction only.** L1 never references L2 or L3. L2 never references L3. A component that reads an L1 variable is a defect, because it bypasses the meaning layer and the token-parity test (`G4`).
2. **No hex literal outside `tokens.css`.** A component that needs a value that does not exist adds an L2 token, and a `07` amendment if the value is in `07`'s scope.
3. **Layer 3 is not a public API.** Component tokens are declared in the same file as the component and are not exported from the design-system entry point.
4. **Dark mode is out of scope.** No `prefers-color-scheme` block exists, so no token has a second value that could ship unreviewed. `07` section 2.3 defines no dark surface, and inventing one would invalidate every measurement in 3.6.

### 6.2 Files

| Path | Contents |
|---|---|
| `app/src/styles/tokens.css` | L1 and L2, inside `@layer tokens`. The only file containing hex literals. |
| `app/src/styles/typography.css` | L3 type utilities bound to the scale in 2.4. |
| `app/src/styles/texture.css` | The single paper-grain selector (3.4). |
| `app/src/styles/motion.css` | Duration and easing tokens, and the `prefers-reduced-motion` block (10.5). |
| `app/src/styles/globals.css` | Imports the four files above in that order, then the three Tailwind directives. This is the `css` path in `components.json`. |
| `app/src/styles/fonts.ts` | The `next/font/local` declarations (2.3). |
| `app/tailwind.config.ts` | Replaces Tailwind's default theme keys rather than extending them (6.3). |

### 6.3 Tailwind configuration policy

```ts
// app/tailwind.config.ts (shape, not the finished file)
// Constraint: defaults are REPLACED, not extended. A utility that would produce a
// default-Tailwind look must not exist, so it cannot be reached by accident.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // No `extend` for colours or fonts. The default palette is gone.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      page: "var(--surface-page)",
      card: "var(--surface-card)",
      official: "var(--surface-official)",
      approved: "var(--surface-approved)",
      interpretation: "var(--surface-interpretation)",
      peer: "var(--surface-peer)",
      "document-mat": "var(--surface-document-mat)",
      ink: "var(--text-primary)",
      muted: "var(--text-secondary)",
      inverse: "var(--text-inverse)",
      default: "var(--border-default)",
      "border-official": "var(--border-official)",
      "border-approved": "var(--border-approved)",
      "border-interpretation": "var(--border-interpretation)",
      "border-peer": "var(--border-peer)",
      error: "var(--state-error)",
      warning: "var(--state-warning)",
      success: "var(--state-success)",
      info: "var(--state-info)",
    },
    fontFamily: {
      editorial: "var(--font-editorial)",
      ui: "var(--font-ui)",
      mono: "var(--font-mono)",
    },
    borderRadius: { sheet: "2px", control: "4px", card: "6px", full: "9999px" },
    boxShadow: {
      card: "var(--shadow-card)",
      overlay: "var(--shadow-overlay)",
    },
    spacing: { 0: "0", 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px", 12: "48px" },
    screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
    extend: {},
  },
  plugins: [],
};
```

Because `theme.colors` is replaced with a twenty-one-key map, `bg-indigo-600` and `text-slate-500` generate no CSS at all. That is the mechanism that makes the default-Tailwind look unreachable rather than merely discouraged.

### 6.4 Token parity with `07`

`07` section 2.3 is the contract for L2. The build runs a test that parses the fenced `text` block in `07` section 2.3, extracts every `--token: value` pair, and asserts that `tokens.css` declares the same names with the same values, ignoring whitespace. A mismatch fails in either direction: a renamed token, a dropped token, or a silently retuned value. This is `G4`, and it is the only mechanism that keeps a doc and a stylesheet honest with each other for the life of the project.

The test also asserts the four added tokens in 3.3, and fails if any token not listed in `07` section 2.3 or in 3.3 is declared at L2. Adding a semantic token therefore requires a doc change in the same commit, which is the intended friction.

---

## 7. The shadcn integration policy

### 7.1 The constraint and the honest resolution

`AGENTS.md` section 5.1: "Tailwind CSS + a small set of owned UI primitives. No component library that supplies its own design language wholesale." A general design standard independently flags default shadcn and Tailwind layouts as generic. The team wants shadcn for velocity. Both are satisfiable, but only under a rule that is specific about what shadcn is being used for.

**The rule.** shadcn is permitted **only** as vendored, owned source, adopted through the CLI with a custom theme, on these five conditions:

1. **Vendored, not installed.** Components are written into `app/src/components/ui/**` by the CLI and are read, edited, and reviewed as first-party code. No shadcn package is ever a dependency, so there is no library that could later update its own appearance.
2. **Themed at adoption.** Every adopted component is re-themed to this doc's tokens in the same commit that adds it. A component whose default classes survive is a defect, not a shortcut.
3. **The default look is not reachable.** Tailwind's default palette and font stack are removed from the config (6.3), so a component that loses its theming renders as unstyled structure rather than as generic shadcn.
4. **The components that carry a design language are hand-built** (7.3). The distinguishing rule: if the component renders one of the five content classes, or if its visual weight is what makes a screen look like shadcn, it is hand-built. shadcn supplies behaviour and accessibility plumbing; it does not supply the appearance of the parts of this product that carry the integrity argument.
5. **The surface area is fixed.** The adopt list in 7.2 is closed. Adding a component to it is a design-system change with a doc edit, and `G2` fails a build that ships a file in `components/ui/` which is not on the list.

Why this is not a dodge: condition 1 is the exact property `AGENTS.md` section 5.1 is protecting. The library that supplies its own design language is the one that keeps its own stylesheet. shadcn's mechanism is that it copies source into the repository and then gets out of the way. Under conditions 1-5 the shipped CSS is ours, the class strings are ours, and the only thing borrowed is behaviour code that is already reviewed and accessible.

### 7.2 Adopt through the CLI, then re-theme

| Component | Why it is safe to adopt | Required re-theme on adoption |
|---|---|---|
| `Dialog` | Focus trap, `aria-modal`, Escape handling, scroll lock. Behaviour, not style | `rounded-overlay`, `shadow-overlay`, `bg-card`, heading in `heading-2` Newsreader, actions right-aligned |
| `Sheet` | Dialog behaviour in an edge container; the Assistant bottom sheet below `lg`, and tutor filters | Same as Dialog, plus `border-default` on one edge only |
| `Popover` | Positioning and dismissal | `rounded-overlay`, `shadow-overlay`, 16px padding |
| `Tooltip` | Delay, placement, `aria-describedby` | `bg-ink text-inverse`, `ui-sm`, no arrow, 200ms open delay |
| `DropdownMenu` | Roving focus, typeahead, submenu semantics | `rounded-overlay`, `shadow-overlay`, 36px item height |
| `Select` | Listbox semantics that are genuinely expensive to hand-build | `rounded-control`, `border-default`, the `--focus-ring` offset preserved |
| `Toast` (`sonner`) | Queueing, timers, role handling | Never the sole report of a failed mutation (13); placed bottom-left so it never covers the Assistant floating action button |
| `ScrollArea` | Cross-browser scrollbar consistency on the Assignment Health table | Thin `--border-default` thumb, no fade, never used to hide content that should reflow |
| `Command` | Combobox semantics for the Milestone picker on a Query | `rounded-overlay`, `ui` family, no gradient highlight row |
| `Accordion` | Disclosure semantics for Milestone groups in the Checklist | 16px Lucide chevron, `aria-expanded` preserved, no border on the last item |
| `Table` | Semantic table scaffolding only | 44px row height, `ui-sm` cells, `--border-default` row rules, `tnum` on numeric cells |
| `Progress` | Fill semantics for the Checklist resolution-rate bar | 6px tall, `--accent-approved` fill, `--border-default` track, text label always present (`07` section 2.1 rule 1) |
| `Skeleton` | Reduced-motion-safe base animation | Static under `prefers-reduced-motion` (10.5); the pulse is opacity only, never a moving gradient |
| `Avatar` | **Restricted.** Permitted only in the top bar for the signed-in user's own identity | Never rendered in a discussion thread, a Query row, or anywhere near an anonymous identity (`07` section 6.3 rule 3). `AuthorLabel` is the only authorship element, and it is hand-built with no avatar prop |
| `Button` | Variant plumbing, `asChild`, disabled semantics | Exactly three variants: `primary` (navy, `--text-inverse`), `secondary` (card surface, `--border-default`), `quiet` (text only). No destructive-red primary: destructive actions use `--state-error` text plus a confirm dialog |
| `Input`, `Textarea` | Controlled/uncontrolled behaviour, `aria-invalid` plumbing | `rounded-control`, `border-default`, `--focus-ring` with offset, 15px `body` |
| `Form` (+ `react-hook-form` + `zod`) | Field-error wiring and `aria-describedby` correctness | Field errors use `--state-error` for both text and border; the error text is `tight`, never uppercase |

`Badge` is **not** on this list. See 7.3.

### 7.3 Hand-built, because the default look carries a rejected design language

| Component | Why it is hand-built | Specified by |
|---|---|---|
| `ContentClassPanel` | Its border style, surface, left rule, badge, and lexical marker are constraint C2 expressed as CSS. A generic card with a variant prop models emphasis level, not truth tier | `07` section 2.2, 2.6 |
| `AuthorityQuote` | The distinction between a T5 panel and a verbatim T1 excerpt inside it is the product's sharpest line (`07` section 2.2 rule 3) | `07` section 2.6, 4.3 rule 2 |
| `Badge` | One badge primitive owns every fixed string in `07` section 2.5. shadcn's variant API encodes emphasis, and adopting it would create a second badge whose variants compete with the five content classes | `07` section 2.2, 2.5, 2.6 |
| `ReviewStatusBadge` | Pre-approval text appears in every artifact state, including edit mode and the validation list (C3, `07` section 7.3 rule 1) | `07` section 2.6 |
| `Card` | A generic card is the strongest generic-SaaS signal. Cards here are `CourseCard` and `AssignmentCard`, with fixed anatomy and no shadow on any content-class variant | `07` section 3.4, 3.5, 3.7 |
| `Alert` | An alert's default variants have no mapping onto the five state kinds, and a refusal must never share a component with an error (`07` section 2.4 item 10) | `07` section 2.1 |
| `StatePanel` | One component, five variants, so the five state kinds cannot drift | `07` section 2.6 |
| `EmptyState` | `07` section 2.1 forbids the word "no data" and requires a sentence naming what would appear plus one action. That is a content contract, not a styled div | `07` section 2.1 |
| `SourceLink` | `Brief, page <n>` plus a deep link is the only way the workspace references a requirement (`07` section 2.4 item 7) | `07` section 2.6, 9.1 |
| `TrustTierLabel` | Tutor-facing tier display, with no student-facing render path | `07` section 2.6 |
| `ProgressMark` | Not started / in progress / complete as icon plus text plus colour, never colour alone | `07` section 2.6, 2.1 rule 1 |
| `ChecklistItemRow` | Owns start, complete, reopen, the elapsed-time label, and the reopened-item rule (D48) | `07` section 4.6 |
| `AssignmentMapTree` | Keyboard tree semantics plus the sticky badge plus the mixed T5/T3 treatment inside one panel | `07` section 4.3 |
| `DocumentViewer` | Page rasterisation, page anchors, zoom steps that do not change pagination | `07` section 4.2 |
| `AssistantMessage` | Owns verdict rendering, citations, streaming, and the refusal boundary treatment | `07` section 4.7.2, 4.7.3 |
| `AuthorLabel` | Accepts only `{ isAnonymised, displayLabel }` and has no prop that can carry a student identifier, so an identity leak is a type error (`07` section 6.3 rule 2) | `07` section 2.6, 6.3 |
| `CitationList` | Renders tier-appropriate labels per citation | `07` section 2.6 |
| `ModerationBadge` | The tutor sees the reason code; a student sees only the hidden-pending-review string | `07` section 2.6, 6.4 |
| `ArtifactCard` | Pre-approval badge in every state, verbatim fields read-only, provenance on demand, inline validation warnings | `07` section 7.3 |
| `IngestionStageList` | Stage names in the tutor's language, never the pipeline's (D13) | `07` section 7.2 |
| `AmbiguityFindingCard` | Two verbatim excerpts side by side, T5 treatment, no clarification-authoring field (D23) | `07` section 7.5 |
| `PostCard` | One-level nesting, tombstone state, ownership-gated edit controls, T4 treatment with the accepted-answer addendum | `07` section 6.2 |
| `FlagDialog` | A fixed five-option reason list that maps to reason codes, not a generic form | `07` section 6.5 |
| `AnalyticsTable` | Insufficient-data rows in place of numbers, never a zero cell | `07` section 8 |

### 7.4 Alternatives considered

| Alternative | Honest assessment | Why not chosen here |
|---|---|---|
| **Radix Themes** | Excellent accessibility, a coherent scale, and it would remove most hand-built work | It fails `AGENTS.md` section 5.1 by design: it ships its own design language (its own radius scale, spacing ramp, and colour system) and its theming layer is an accent-colour slot, not a token architecture. Getting this direction out of it would mean fighting its scale in every component. |
| **Park UI (Ark UI + Panda CSS)** | Headless, token-first, and architecturally the best fit for a custom design system; its token model is closer to section 6 than shadcn's is | It introduces a second styling system (Panda's build step) beside Tailwind, and the team's fluency is in Tailwind. On a 48-hour clock, two styling systems and a new build pipeline is a schedule risk with no scoring benefit. |
| **Base UI** | Headless primitives in the Radix class, with a strong accessibility story, and it is where the ecosystem is moving | API churn during an event is a poor trade, and fewer behaviours are pre-built, so more of the expensive keyboard work lands in the build window. |
| **Mantine** | The fastest path to a complete-looking application, with excellent documentation and a large component set | Its visual language would win by default, which is the exact failure mode `AGENTS.md` section 5.1 and `07` section 2.4 guard against. Re-theming it to this direction costs more than it saves. |
| **Radix primitives, directly** | The behaviour layer shadcn vendors. Adopting them directly is legitimate | This is the fallback when a hand-built component needs presence management, focus trapping, or listbox semantics: hand-build the **appearance**, reuse Radix for **behaviour**. It is not a substitute for the adopt list, because it forgoes shadcn's Tailwind bindings for no gain. |

### 7.5 CLI and configuration

```json
// app/components.json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks",
    "utils": "@/lib/utils"
  },
  "iconLibrary": "lucide"
}
```

1. `baseColor: "neutral"` is a **scaffold value only**. The CLI writes it into `globals.css` on init; the first post-init commit overwrites the generated variables with the L2 block from `tokens.css` and deletes anything left over. A generated colour value that survives review is a defect.
2. `aliases.ui` is pinned to `@/components/ui` so vendored files land in one directory that `G2` can scan and that reviewers treat as third-party-derived.
3. `rsc: true`, because the shell, the workspace, and the tutor screens are server components and only interaction-holding components are client components.
4. After running the CLI, the same commit applies the re-theme column in 7.2, adds the component to the adopt table here, and passes `G2`.

### 7.6 Enforcement, consistent with `AGENTS.md` section 5.4

Four gates, in increasing order of strength. The first two are conventions; the last two are machine-checked.

1. **The `<Theme>` wrapper convention.** `app/src/app/layout.tsx` renders one `<html>` carrying `data-theme="institutional-editorial"` and the three font variables on the same element. A `ThemeScope` server component takes `tone: "official" | "approved" | "structure" | "peer" | "interpretation"` and is the **only** way a page obtains a content-class frame: it sets `data-content-class` on the panel, which is what the grain selector (3.4) and the gates key off. No other component sets a content-class surface, border, or left rule.
2. **Import discipline.** `eslint no-restricted-imports` forbids `@radix-ui/*` outside `app/src/components/ui/**`, and forbids importing from `@/components/ui/**` inside `app/src/lib/**`. Behaviour primitives are adopted in one directory; feature code consumes the wrapper.
3. **The style gate.** `app/scripts/check-design.mjs`, run as part of `pnpm lint`, fails the build on: a hex literal outside `tokens.css`; a `bg-*`/`text-*`/`border-*` class not present in the `theme.colors` map in 6.3; `rounded-(md|lg|xl|2xl|3xl)` anywhere; a `shadow-` class on an element bearing `data-content-class`; a `font-editorial` class inside a component that renders a T4 or T5 element (`G10`); a `transition-duration` or `animate-` value above 150ms; a second selector applying the paper grain (`G9`); a `components/ui/` file not listed in 7.2 (`G2`); a reference to `fonts.googleapis.com` or `fonts.gstatic.com` (`G5`); and a `@keyframes` block outside `skeleton.tsx` and `motion.css` (`G8`). The same script performs the token-parity check in 6.4 (`G4`).
4. **The screenshot gate.** `pnpm test:e2e` captures the Assignment/Info tab at 375, 768, and 1280 with the header cropped, desaturates each capture, and asserts that the official and interpretation panels remain distinguishable (`G1`) and that every T5 badge is present and untruncated (`G3`). A visual contract that no test checks is a visual contract that decays.

---

## 8. Component inventory

Primitive source: `shadcn` means vendored and re-themed per 7.2; `hand-built` means first-party per 7.3. `07` is the authority on behaviour; where a row cites two sections, the first owns behaviour and the second owns appearance.

| Component | Source | Variants | States covered | Specified by |
|---|---|---|---|---|
| `ContentClassPanel` | hand-built | `official`, `approved`, `structure`, `peer`, `interpretation` | All five state kinds via `StatePanel` where a fetch failed | `07` section 2.2, 2.6 |
| `ThemeScope` | hand-built | five `tone` values | n/a (structural) | `07` section 2.2; this doc 7.6 |
| `Badge` | hand-built | `content-class` (five fixed strings), `status` | n/a | `07` section 2.2, 2.5 |
| `ReviewStatusBadge` | hand-built | pre-approval, published | Every artifact state: list, expanded, edit, validation | `07` section 2.6, 7.3 rule 1 |
| `StatePanel` | hand-built | `loading`, `empty`, `error`, `insufficient-data`, `refused` | The five state kinds | `07` section 2.1, 2.6 |
| `EmptyState` | hand-built | list, tab, section | Empty | `07` section 2.1 |
| `AuthorityQuote` | hand-built | inline, block | n/a | `07` section 2.6, 4.3 rule 2 |
| `SourceLink` | hand-built | inline, block | Resolved, unresolved (`No page location found`) | `07` section 2.6, 4.3 rule 3 |
| `TrustTierLabel` | hand-built | T1-T5 | n/a (tutor-facing only) | `07` section 2.6 |
| `ProgressMark` | hand-built | `not-started`, `in-progress`, `complete` | All three | `07` section 2.6, 4.6 |
| `Button` | shadcn | `primary`, `secondary`, `quiet` | default, hover, focus-visible, active, disabled, loading | `07` section 2.7 |
| `Input`, `Textarea` | shadcn | default, invalid, disabled | Focus, invalid, disabled, at-limit counter | `07` section 4.7.2 rule 7 |
| `Select`, `Checkbox`, `RadioGroup` | shadcn | default | Focus, invalid, disabled | `07` section 6.5, 8 |
| `Form` field | shadcn + `react-hook-form` + `zod` | inline, field-level | Invalid, submitting, server error | `07` section 7.1, 9.4 |
| `Dialog` | shadcn | `confirm`, `preview`, `scope-warning` | Loading, error inside the dialog | `07` section 5.4, 7.4 |
| `Sheet` | shadcn | bottom (Assistant below `lg`), side (filters) | Open, closing, focus restored | `07` section 3.3 rule 5 |
| `Popover`, `DropdownMenu`, `Tooltip` | shadcn | default | Open, focus-visible, disabled item | `07` section 2.7 |
| `Tabs` | hand-built | segmented (below `md`), underline (`md` and above) | Active, inactive, count badge, disabled | `07` section 3.3, 4.1 |
| `Accordion` | shadcn | Milestone group, FAQ entry | Expanded, collapsed, empty group | `07` section 4.6 rule 1, 6.1 |
| `Toast` | shadcn (`sonner`) | `status`, `alert` | Success, failure-on-optimistic-revert | `07` section 4.6 rule 4 |
| `DocumentViewer` | hand-built | brief, rubric, policy, supplementary | Loading, empty, per-document error, extraction warning | `07` section 4.2 |
| `AssignmentMapTree` | hand-built | full, filtered, narrow | Loading, empty, error, unresolved source | `07` section 4.3 |
| `MapNodeDetail` | hand-built | Requirement, Rubric, Milestone | Selected, unresolved source | `07` section 4.3 rules 2-6 |
| `ChecklistItemRow` | hand-built | not-started, in-progress, complete, reopened | All four, plus optimistic and reverted | `07` section 4.6 |
| `QueryThread`, `QueryComposer` | hand-built | student, tutor | Loading, empty, send error, reply error | `07` section 4.4, 5.2, 5.3 |
| `PostCard` | hand-built | attributed, anonymous, accepted answer, hidden, tombstone | All five, plus edited and own-post controls | `07` section 6.2, 6.4 |
| `AuthorLabel` | hand-built | anonymous, attributed | n/a | `07` section 6.3 rule 2 |
| `FlagDialog` | hand-built | five fixed reasons | Default, already-flagged (disabled), error | `07` section 6.5 |
| `ModerationQueueItem` | hand-built | AI flag, student flag | Open, acted on, failed action | `07` section 6.6 |
| `UploadDropZone`, `UploadRow` | hand-built | pending, uploading, extracted, failed, duplicate | All five, plus remove and retry | `07` section 7.1 |
| `IngestionStageList` | hand-built | running, long-running, failed, complete | All four | `07` section 7.2 |
| `ArtifactCard` | hand-built | Requirement, Rubric, Milestone, Checklist item, FAQ candidate, AI policy | Collapsed, expanded, editing, warned, approved, rejected, stale revision | `07` section 7.3 |
| `AmbiguityFindingCard` | hand-built | contradiction, ambiguity, unlocated | Open, resolving, resolved, dismissed | `07` section 7.5 |
| `PublishScopeDialog` | hand-built | ready, blocked | Ready, publishing, blocked, failed | `07` section 7.4 |
| `AnalyticsTable` | hand-built | with data, insufficient data | Loading, empty, insufficient data, stale | `07` section 8, 8.2 |
| `AssistantMessage` | hand-built | student, assistant, refusal (four templates), unavailable | The panel's five state kinds | `07` section 4.7.2, 4.7.3 |
| `CitationList` | hand-built | grounded, no-grounding | Grounded, no grounding | `07` section 4.7.2 rule 2 |
| `ProactiveNotice` | hand-built | 1-3 bullets, dismissed | New, dismissed, returning | `07` section 4.7.1 |
| `UploadChip` | hand-built | pending, scanned, blocked | All three, plus refused-on-send | `07` section 4.7.2 rule 5 |
| `Skeleton` | shadcn | card, row, page, tree | Loading; static under reduced motion | `07` section 2.1 |
| `ScrollArea` | shadcn | vertical, horizontal | Overflowing, not overflowing | `07` section 2.7 |
| `Avatar` | shadcn | own-identity only | n/a | `07` section 6.3 rule 3; this doc 7.2 |
| `SkipLink`, `VisuallyHidden`, `LiveRegion` | hand-built | polite, assertive | n/a | `07` section 2.7; this doc 11.3 |

---

## 9. Iconography

1. **One set: Lucide**, at 16px inline and 20px in a control, stroke width 1.5. It is `components.json`'s `iconLibrary` and the only icon dependency.
2. **Icons never carry meaning alone.** Every icon is adjacent to text, and no status is icon-only. `ProgressMark` is icon plus text plus colour, per `07` section 2.1 rule 1.
3. **Filled, duotone, and coloured icon variants are not used.** A filled icon reads as an app affordance; an outline icon reads as a notation.
4. **Decorative icons are `aria-hidden="true"`; a meaningful icon takes its accessible name from adjacent text, not from an `aria-label` on the glyph.**
5. **No icon is invented for a truth tier.** The badge text and the border style are the tier signal; a tier icon would be a third, redundant cue and a second thing to keep synchronised.
6. **No icon buttons in the document viewer or the Map.** Page navigation uses labelled controls, because `07` section 4.2 rule 10 makes page navigation the only control the viewer adds and it must be unambiguous.
7. **The Assistant floating action button** is the one circular control (`radius: full`), labelled `Assignment Assistant`, with the unread dot implemented as a border plus a visually hidden count rather than a colour-only dot (`07` section 3.3 rule 4).

---

## 10. Motion

### 10.1 Philosophy

Motion in this product has one job: to make the arrival of content legible without making the arrival of content interesting. A student opening an assignment should feel that a document was laid down in front of them, not that a page loaded. Decorative motion is not merely unnecessary; it contradicts the direction, because a product that animates confidently is a product that is performing.

### 10.2 The one entrance sequence

There is exactly one authored entrance in the product: the Assignment/Info tab's document settle.

| Step | Element | Property | Delay | Duration |
|---|---|---|---|---|
| 1 | T1 official documents panel | opacity 0 to 1, translateY 4px to 0 | 0ms | 120ms |
| 2 | T5 Assignment Map panel | opacity 0 to 1, translateY 4px to 0 | 90ms | 120ms |
| 3 | Published AI Usage Policy card | opacity 0 to 1, translateY 4px to 0 | 150ms | 90ms |

Rules:

1. The sequence runs **once per session per assignment**, tracked in `sessionStorage`. A student who returns to the tab, switches tabs, or reloads does not watch it again. An entrance that repeats becomes a tax.
2. Total time to settled content is under 400ms, and no element animates twice.
3. The translate is 4px, never more. A larger movement reads as a slide transition, which is another product's vocabulary.
4. The entrance never gates content: the elements are in the DOM and interactive from the first frame; only opacity and transform animate.
5. No other screen has an entrance. The tutor screens, the Assistant panel, and every list render without an opening animation.

### 10.3 Hover and focus

1. **Hover changes exactly one property**: the colour of a border, an underline, or a background, at the `fast` duration. A hover never moves, scales, lifts, or reveals an element that is not otherwise reachable.
2. **No hover-only affordances.** If a control exists, it is visible before hover at every breakpoint. This is both a design rule and a keyboard-accessibility requirement (`07` section 2.7).
3. **Focus is instant.** The focus ring appears with no transition, because a delayed focus indicator is a failed focus indicator.
4. **A meaningful state change may transition once**: a progress-bar fill (150ms), an accordion disclosure (150ms), a toast entering (150ms). Each is a single property, and none loops.

### 10.4 Durations and easings

`07` section 2.7 caps motion at 150ms opacity and transform transitions. This doc defers to that ceiling and defines the scale beneath it.

```css
/* app/src/styles/motion.css */
@layer tokens {
  :root {
    --motion-fast: 90ms;    /* hover, focus-adjacent colour changes */
    --motion-base: 120ms;   /* the entrance sequence, toast entry */
    --motion-slow: 150ms;   /* accordion disclosure, progress fill. HARD CEILING */
    --ease-out: cubic-bezier(0.2, 0, 0, 1);
    --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  }
}
```

1. No duration above 150ms exists in the shipped CSS. `G8` fails the build on one.
2. Two easings only. No spring, no bounce, no overshoot, no `steps()`, and no easing with a control point outside `[0, 1]`.
3. `animation` is permitted in exactly two places: the `Skeleton` opacity pulse and the toast entry. A `@keyframes` block outside `components/ui/skeleton.tsx` and `motion.css` fails the build.

### 10.5 The reduced-motion path

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-base: 0ms;
    --motion-slow: 0ms;
  }
  [data-content-class] { animation: none !important; transition: none !important; }
  [data-skeleton] { animation: none !important; }
}
```

1. Under reduced motion, the entrance sequence renders all three panels at once with no transform. The step delays collapse to zero rather than being skipped, so no state change is lost.
2. **A reduced-motion skeleton is a static neutral block plus text.** The skeleton's meaning is carried by the `role="status"` line (`Loading <noun>...`), which is not motion-dependent, so removing the pulse costs nothing. This is why the loading copy in `07` section 2.1 is a requirement and not decoration.
3. Every state change conveyed by motion is also conveyed by text. There is no case in this product where motion is the only signal, which is what makes a zero-millisecond path safe.

### 10.6 Prohibited motion

Animated counters and ticking numbers; animated progress on mount as opposed to on a state change; a typing indicator with sequential dots; a bouncing or pulsing Assistant floating action button; a shimmer as the only loading signal; parallax; auto-playing anything; a page-level route transition; confetti or celebration states; a hover lift with a shadow change; a colour pulse that draws the eye to an unchanged element. The animated-counter prohibition has a product reason in addition to an aesthetic one: an animated resolution rate implies a precision that a cohort aggregate subject to the D32 k-anonymity floor does not have.

---

## 11. Accessibility mechanics

`07` section 2.7 states the requirements. This section states how they are implemented and where they are easy to get wrong.

### 11.1 Focus

1. `:focus-visible` is the only focus style. `:focus { outline: none }` without a replacement fails review, and `outline: none` in any form fails `G6`.
2. The ring is `2px solid var(--state-info)` with a 2px offset, from the tokens in 3.3. The offset is a contrast mechanism, not a spacing preference (3.6), and the ring is never drawn inset.
3. Focus order follows visual order. The Map is the only place besides modals where focus is programmatically managed; everywhere else the DOM order is the tab order.
4. Focus is trapped only inside `Dialog` and `Sheet`, and is released to the invoking control on close. A `Popover` does not trap focus.
5. Focus is never moved on a data refresh. When a Checklist item is optimistically completed and the server confirms, focus stays on the control that was activated.
6. Opening the Assistant panel moves focus into the composer only when the student opened it deliberately. The proactive notice (O2) never steals focus, because a focus steal on page load is indistinguishable from a trap.

### 11.2 Keyboard traversal of the Assignment Map

The Map is a tree at every breakpoint. The `sm` and `md` treatments render the same `role="tree"` structure as an indented vertical list; the breakpoint changes the visual treatment, not the semantics. This is a refinement of `07` section 4.3 rule 8, which requires the vertical indented list form below 900px: keeping one semantic role is what prevents a role switch at a breakpoint, which is itself a defect. An indented vertical list is a valid tree presentation.

| Key | Behaviour |
|---|---|
| `Tab` | Moves to the tree and away from it as a single stop (roving `tabindex`: exactly one node has `tabindex="0"`, the rest `-1`) |
| `ArrowDown` / `ArrowUp` | Moves to the next / previous visible node, without expanding anything |
| `ArrowRight` | On a collapsed parent, expands it; on an expanded parent, moves to its first child; on a leaf, does nothing |
| `ArrowLeft` | On an expanded parent, collapses it; on a child or leaf, moves to its parent |
| `Home` / `End` | First / last visible node |
| `Enter` or `Space` | Selects the node and opens the detail panel, moving focus **to** the panel |
| `Escape` | Closes the detail panel and returns focus to the selected node. It does not collapse the tree |
| `*` | Expands every sibling at the focused node's level (permitted, because it is a standard tree convention) |

ARIA: `role="tree"` on the container; `role="treeitem"` with `aria-level`, `aria-setsize`, and `aria-posinset` on each node; `aria-expanded` on parents only; `aria-selected` on the selected node. The badge is a sibling of the tree, not a tree item, so it is never announced as part of a node's name. The verbatim `AuthorityQuote` inside a node is included in a node's accessible name only when that node is selected and the detail panel is open, so traversing sixty nodes does not read sixty quotations.

Three failure modes to test explicitly: focus must not land on a hidden node after a collapse; `aria-expanded` must not be present on a leaf; and expanding a collapsed node must not move focus.

### 11.3 Live regions for the four asynchronous state kinds

`07` section 2.1 rule 2 requires loading completion, errors, and refusals to be announced. Four state kinds arrive asynchronously and are announced; `Empty` is content delivered at first paint and is read in normal reading order, so it is never announced, because announcing it would interrupt a screen reader with a sentence it is about to read anyway.

One visually hidden region of each politeness level is mounted once in the shell:

| State kind | Region | Politeness | Message | Rules |
|---|---|---|---|---|
| Loading | `role="status"` | `polite` | `Loading <noun>...` on start; `Still working.` once at 8s | The skeleton carries `aria-hidden="true"`; only the text announces. The 8s line announces once and never repeats on a timer. |
| Error | `role="alert"` | `assertive` | The `07` section 2.1 error sentence plus the request id | Announced once on mount, with `aria-atomic="true"` so the request id is included. A retry that fails again re-announces. |
| Insufficient data | none | - | Rendered as static content at first paint | Not an event. It is present in the DOM on load so it is read in order. A recompute that changes a row from data to insufficient data announces a polite update through the status region. |
| Refused request | `role="alert"` | `assertive` | The refusal opener only | Announced once, assertively, because it answers a direct student action. The full panel is normal DOM content afterwards, so it stays re-readable by navigation and is not repeated. |

Streaming assistant text: the transcript is **not** a live region. One visually hidden `role="status"` region receives sentence-sized flushes, emitted on a sentence boundary (`[.!?]` followed by whitespace) or every 240 characters, whichever comes first. Per-token announcement is a defect: it floods the queue and makes the panel unusable (`07` section 2.7). The visible streaming container carries `aria-busy="true"` while the stream is open, so partial sentences are not announced twice, and the attribute is cleared when the stream closes. A refusal arrives with no tokens at all (`07` section 4.7.2 rule 4), so the refusal announcement is never queued behind streamed text.

Toasts: success toasts use the polite region, failure toasts the assertive region, and neither moves focus. A toast is never the only report of a mutation that failed to change server state (`07` section 4.6 rule 4 pairs the toast with a reverted row).

### 11.4 Reduced motion and increased contrast

1. The reduced-motion path is 10.5. It is a token override, so no component needs a motion-specific branch.
2. `prefers-contrast: more` raises every truth-tier border to 2px, replaces the dotted T4 border with a 2px dashed border, and switches `--text-secondary` to `--text-primary`. It changes no hue, because hue is not the tier signal.
3. `prefers-reduced-transparency` has no effect: nothing in the product uses transparency except the grain (which is opaque paint with a blend mode) and the dialog scrim, which is a solid colour with an alpha channel and no blur.

### 11.5 Contrast requirements and the risk register

Requirements: 4.5:1 for text below 18.66px bold or 24px regular, 3:1 for meaningful non-text boundaries and graphical objects, checked per token against its own background, and re-checked on the composited screenshot where the grain layer is involved.

| Risk | Where it is real | Measured | Action |
|---|---|---|---|
| Amber text on the amber tint | T5 prose and the 11px badge on #FFFBF0 | 5.25:1 | Safe. Never lower the badge below 11px or weight 600 |
| Amber as a border | The T5 dashed frame and 4px dashed left rule on white | 5.43:1 | Safe. Border style is a tier signal, so the border must never be lightened to a decorative grey |
| Amber under opacity de-emphasis | Any disabled or muted amber control | approx. 2.6:1 at 60% opacity | Banned. Disabled states swap tokens, they do not reduce opacity |
| `--border-peer #98A2B3` as a T4 boundary | The dotted T4 border, load-bearing for the greyscale test | 2.58:1 | **Fails.** Amendment proposed in section 15; `G7` fails the build |
| `--border-default #D0D5DD` | Structural dividers | 1.47:1 | Permitted as decorative. It must never be the only cue that two things differ |
| Focus ring flush against a navy control | A primary button without the offset | 1.45:1 | The 2px offset is required; the ring is never inset |
| Focus ring against every real surface | Page, card, tinted, warm mat | 5.64:1 to 5.99:1 | Safe |
| Grain over the document mat | Behind the rasterised page | measured shift under 0.05 on every pair above | Re-verified on the composited screenshot, not on token values (`G7`) |
| Tier treatment without colour | The greyscale test | border style, badge text, left-rule presence | The three non-colour cues are what `G1` asserts; colour is the fourth cue, never the first |

### 11.6 Target size, zoom, and the rasterised document

1. Interactive targets are at least 24x24 CSS px, 44x44 preferred on touch (`07` section 2.7). At `sm`, the table filter controls and the Checklist state controls are the two places this is usually violated; both use a 44px minimum at that breakpoint.
2. At 200% zoom the main reading columns do not scroll horizontally (`07` section 2.7). The Assignment Health table is the exception and scrolls inside its own container rather than the page.
3. The viewer's zoom (75, 100, 125, 150 percent, `07` section 4.2 rule 6) changes only the rasterised page, never the pagination, so page anchors stay valid. The viewer's control is labelled `Page zoom` and does not resize the surrounding chrome, which keeps it distinct from browser zoom.
4. Text embedded in a rasterised page image is not selectable or reflowable, which is a deliberate scope decision (`07` section 4.2 rule 7). The accessibility consequence is that the page image must not be the only route to the content: requirement citations, the `AuthorityQuote` excerpts inside Map nodes, and the extracted grounding text all carry the same information as text. The page image therefore carries an `alt` naming the document and the page number, and the surrounding panel carries the `Source:` label in `mono`.

---

## 12. Quality gates

Ten checkable rules. Each names the mechanism and the failure. G1 and G3 are the two a reviewer can also check by hand in under a minute, which is why they come first.

| # | Gate | Mechanism | Fails when |
|---|---|---|---|
| G1 | **Greyscale screenshot test.** With saturation at 0, all five content classes remain distinguishable by border style, badge text, and left-rule presence (`07` section 2.2 rule 6, NFR-A-4) | `pnpm test:e2e` desaturates captures of the surfaces that render each class and asserts the treatments remain distinct | Two classes collapse to the same greyscale appearance, or a class is distinguishable only by hue |
| G2 | **No default shadcn geometry survives.** Every file in `components/ui/` is on the adopt list, and `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl` appear in none of them | `check-design.mjs` scans `components/ui/**` against the 7.2 list and a radius allowlist | An adopted component retains a default radius, or an off-list component is vendored |
| G3 | **Every T5 element carries its badge at every breakpoint, untruncated.** The badge text equals the `07` section 2.2 string, and `scrollWidth <= clientWidth + 1` on the badge element | A per-breakpoint DOM assertion at 375, 768, and 1280 on every route that renders a T5 element | A badge is absent, shortened, ellipsised, or scrolled out of view in the Map |
| G4 | **Token parity with `07` section 2.3.** Every name and value in `07` section 2.3 appears in `tokens.css`, and no unlisted L2 token exists | A test that parses the fenced block in `07` section 2.3 and diffs it against `tokens.css` | A token is renamed, dropped, silently retuned, or added without a doc change in the same commit |
| G5 | **The default palette and default font stack are absent.** `theme.colors` and `theme.fontFamily` are replaced, not extended; no `fonts.googleapis.com` or `fonts.gstatic.com` reference exists; no `@import` of a font stylesheet exists | `check-design.mjs` inspects `tailwind.config.ts` for a default-theme spread and greps the source and CSS for the two font hosts | A Tailwind default colour utility generates CSS, or a font is fetched at run time |
| G6 | **Focus visibility.** Every interactive element on the Map, the Checklist, the Assistant panel, and the review screen computes a `:focus-visible` ring of 2px at a 2px offset, and no rule sets `outline: none` without a replacement | A tab-through test that reads computed styles after `Tab` | A control has no visible ring, uses `:focus` instead of `:focus-visible`, or draws the ring inset |
| G7 | **Contrast.** Every (foreground, surface) pair actually used in `src/components/**` class strings meets 4.5:1 for text and 3:1 for a meaningful boundary, and the grain layer is included by sampling the composited screenshot | A script that extracts token pairs from class strings, computes WCAG ratios, and cross-checks the composited capture | Any pair falls below its minimum. The `--border-peer` pair at 2.58:1 currently fails this gate |
| G8 | **Motion ceiling, keyframe containment, and font payload.** No duration above 150ms; no `@keyframes` outside `skeleton.tsx` and `motion.css`; total committed font payload at or under 190 KB | `check-design.mjs` plus a size assertion in the build step, and a reduced-motion snapshot run | A transition exceeds 150ms, a keyframe animation is added elsewhere, or the font payload grows |
| G9 | **Grain containment and the recognition test.** Exactly one selector applies the paper grain, its target carries `data-content-class="official"`, and the Assignment/Info tab renders both an official and an interpretation panel in the same view | `check-design.mjs` counts grain selectors; the e2e test asserts both classes exist on the tab at every breakpoint | The grain is applied to a second surface, or a workspace view shows one class without the other |
| G10 | **Authority-type containment.** `font-editorial` never appears in a component that renders a T4 or T5 element, except inside `AuthorityQuote` | `check-design.mjs` scans class strings per component and resolves each component's rendered content classes | The serif sets AI interpretation prose or peer prose, which is a C2 defect expressed as typography |

---

## 13. Anti-patterns

Not preferences. Each is a defect with a reason.

| # | Anti-pattern | Why it is a defect |
|---|---|---|
| 1 | Purple, indigo, or violet gradients anywhere | The signature of the category the product differentiates itself from (D2) |
| 2 | Glassmorphism, `backdrop-blur`, or a translucent content panel | Implies softness and layering where the product's claim is crisp provenance |
| 3 | A `rounded-2xl` or larger content frame | Reads as a consumer app surface; a document has corners |
| 4 | A shadow on a content-class panel | Elevation means "not part of the page"; a document is part of the page |
| 5 | A status conveyed only by colour or only by an icon | `07` section 2.1 rule 1, and it fails the greyscale test |
| 6 | The word "official" on a T5 element, at any status | `07` section 2.4 item 4; the exact confusion C2 exists to prevent |
| 7 | A badge that is truncated, abbreviated, collapsed on scroll, or dropped at a breakpoint | `07` section 2.4 item 6; the badge is the tier signal, not a label |
| 8 | Serif type on AI-generated or peer prose | Authority expressed as a font choice is authority the content does not have |
| 9 | An animated counter, a ticking number, or a number that counts up | Implies a precision that a k-anonymity-floored aggregate does not have (D32) |
| 10 | A skeleton shimmer as the only loading signal | Forfeits the reduced-motion path and communicates only through motion (10.5) |
| 11 | A spinner centred on an empty page | `07` section 2.1 requires a skeleton matching the final layout's shape |
| 12 | Inter, Roboto, Arial, or `system-ui` in a font stack, including as a fallback | Section 2.2; the generic look must not be reachable by degradation |
| 13 | Any Tailwind default palette class (`bg-slate-100`, `text-indigo-600`) | Section 1.2. The default palette is removed from the config, so this is also a build failure |
| 14 | A dotted or dashed border on a T1 or T2 frame, or a solid border on a T5 frame | The border style carries the tier; swapping it is a truth-tier defect |
| 15 | An avatar, a per-user accent colour, or an identical placeholder near an anonymous post | `07` section 6.3 rule 3; a placeholder is a linkability vector |
| 16 | A toast as the only report of a failed mutation | The user cannot tell whether anything was saved |
| 17 | A hover-only affordance | Fails keyboard access and makes the control invisible until discovered |
| 18 | Smart quotes, em dashes, or box-drawing characters in UI copy or code comments | `AGENTS.md` section 5.3 is ASCII-only |
| 19 | An illustration, mascot, or empty-state graphic | Tone that contradicts the integrity argument (section 1.2) |
| 20 | A second badge primitive, or a card variant whose difference is emphasis rather than truth tier | Two components modelling the same axis will drift, and the drift will land in the tier signal |

---

## 14. Conflicts with `07`, and how each resolves

`07` wins in every row of this table. Where a row identifies a defect rather than a preference, that is stated plainly, because `AGENTS.md` section 8 requires a wrong doc to be reported rather than coded around.

| # | Item | This doc's preference | `07` says | Resolution |
|---|---|---|---|---|
| 1 | Motion duration | A 160ms base and a 220ms ceiling would give the entrance more room | Section 2.7 caps motion at 150ms opacity and transform transitions | **Defer to `07`.** The scale in 10.4 is 90/120/150ms with 150ms as a hard ceiling, and `G8` enforces it |
| 2 | Page background warmth | A warm page background (#FAF9F7) would make the paper metaphor consistent across the whole product | Section 2.3 fixes `--surface-page #F7F8FA`, a cool neutral | **Defer to `07`.** Warmth is delivered inside T1 surfaces only, via `--surface-document-mat`, the grain, and `--surface-document-edge` (3.3, 3.4). The amendment is proposed in section 15, item 1 |
| 3 | `--border-peer #98A2B3` | A darker grey, #667085 | Section 2.3 fixed #98A2B3, and section 2.2 gives T4 a 1px dotted border whose perceivability the greyscale test depends on | **Resolved: `07` was amended.** Measured at 2.58:1 against white, below the 3:1 that `07` section 2.7 itself requires for a meaningful boundary. Recorded as **D65** and `07` section 2.3 now reads `--border-peer #667085` (4.97:1). The reported defect was fixed at source rather than coded around, per `AGENTS.md` section 8 |
| 4 | The serif promise | The brief's own text would ideally be set in Newsreader, which is what a university-press direction implies | Section 4.2 rule 7 rasterises the brief page by page and forbids a second searchable rendering | **Defer to `07`.** The document's own typography is the document's, and a page image preserves it more faithfully than a webfont could. Newsreader reaches T1 as chrome (header, `Source:` label, page caption) and as `AuthorityQuote` excerpts. The aesthetic promise is delivered by the page image, the warm mat, the grain, and the frame. This is the one place where the direction's stated promise and `07`'s rendering decision meet, and it is worth stating in the demo script |
| 5 | Map semantics at narrow widths | One `role="tree"` at every breakpoint | Section 4.3 rule 8 turns the Map into a vertical indented list below 900px | **Compatible, and made explicit.** An indented vertical list is a valid tree presentation, so the breakpoint changes the visual treatment and not the semantics (11.2). This avoids a role switch at a breakpoint, which would be an accessibility defect |
| 6 | Corner radius on content frames | A 2px `sheet` radius distinct from `07`'s 6px card radius | Section 2.3 lists 6px (cards) and 4px (badges) | **Compatible.** Both `07` values are kept (3.5). The 2px value is an addition for content frames only |
| 7 | `Badge` as a shadcn component | The initial suggestion was to adopt shadcn's `Badge` | Section 2.2 and 2.5 own five fixed badge strings whose treatment is a constraint | **Deviation from the brief, not from `07`.** `Badge` is hand-built (7.3). Adopting shadcn's `Badge` alongside it would create two badge primitives whose variants compete with the five content classes |
| 8 | Font families | Newsreader, IBM Plex Sans, IBM Plex Mono | Section 2.3 specifies sizes and no families | **No conflict.** Families are this doc's layer |
| 9 | `--shadow-card` | Restricted to cards, never on a content frame | Section 2.3 defines the token and does not say what uses it | **Compatible.** The token keeps `07`'s value and its use is constrained (3.5) |
| 10 | Added L2 tokens | Four tokens are needed by the treatment in 3.3 and 3.4 | Section 2.3 defines the L2 set | **Compatible by `07`'s own terms.** Section 2.3 says values "may be tuned without changing this doc's structure"; the four additions are named in 3.3, and `G4` requires a doc change in the same commit as any further addition |

---

## 15. Register impact

Status: **three of the four items below have been applied by the Lead; one remains an open proposal.** Applied items are recorded in `01-DECISIONS.md` and the affected docs were amended in the same change. Phase 5 added the fifth register row below (**D106**, the font degradation path) when the token layer landed; **it is now mirrored into `01-DECISIONS.md` as D106**, which is that register's home, and this section remains the design-system record of the same decision.

**`07` section 2.3 amendments**

1. `--border-peer: #667085` in place of #98A2B3. **APPLIED** as **D65**. This was not cosmetic: the previous value measured 2.58:1 against white, below the 3:1 that `07` section 2.7 requires for a meaningful boundary, on a border that the greyscale test in `07` section 2.2 rule 6 depends on.
2. `--surface-page: #FAF9F7` (warm) in place of #F7F8FA, to make the paper metaphor consistent with the T1 substrate. **PROPOSED, not applied.** Cosmetic and reversible: `--text-primary` on #FAF9F7 measures 16.87:1, so it changes the aesthetic and not the accessibility position. Decide before UI work starts or leave the cool neutral.

**Register rows**

| Id | Decision | Status | Rationale |
|---|---|---|---|
| D63 | **`17-DESIGN-SYSTEM.md` is the design-system authority**: aesthetic direction, typography, texture, motion, iconography, token architecture, component inventory, and accessibility mechanics. `07` remains authoritative on screens, state kinds, content classes, fixed strings, and core token values. | **APPLIED** | Without a stated precedence, the two docs diverge on the first disputed value, and the divergence lands in CSS where no reviewer looks. The rule is: `07` owns what a screen says, `17` owns how it is built. |
| D64 | **shadcn is permitted only as vendored, owned, re-themed source**, under the five conditions in 7.1, with the adopt list in 7.2 closed and the components in 7.3 hand-built. | **APPLIED** | `AGENTS.md` section 5.1 forbids a component library that supplies its own design language. Vendored source is not that, but only if the default look is unreachable and the appearance-carrying components are first-party. Stating it as a decision makes the boundary reviewable rather than a matter of individual judgement under deadline. |
| D106 | **The three font families ship as their documented metric-compatible fallbacks, with no `next/font` variable and no woff2 file, until the seven binaries of 2.3 are committed.** `--font-editorial`, `--font-ui` and `--font-mono` are declared in `tokens.css` from the fallback stacks of 2.2 rule 2, and `app/src/styles/fonts.ts` exports those stacks plus the absent variable names, so restoring a family is one line per family: declare it with `next/font/local`, expose the variable on `<html>`, and prepend `var(--font-<family>)` to the stack in both files. | **APPLIED** (`05-ISSUES.md` I-44 step 3) | Both alternatives fail. `next/font/google` fetches at build time, which `11` WP-01 and `12` section 8 forbid and `G5` fails; a `localFont` declaration pointing at a file that is not in the repository fails the build somewhere that reads like a stylesheet bug. Two consequences are recorded rather than hidden: this deviates from 2.2 rule 2's "every stack begins with a `next/font` CSS variable" until the binaries land, and 2.3's seven woff2 files (<= 190 KB) with an `OFL.txt` beside each remain owed. `scripts/check-design.mjs` asserts that the two copies of each stack cannot drift, and refuses Inter, Roboto, Arial and `system-ui` at any position in a stack. |

**Additions the gate authorises, and why the count is not four.** `scripts/check-design.mjs` (G4c) requires every L2 token in `tokens.css` to be named either by `07` section 2.3 or by this doc, and the sources it accepts are: 3.3's four tokens; 3.5's `--shadow-overlay`, which 6.3's Tailwind `boxShadow` map already reads, so 3.3's "four" is one short of what this doc itself requires; and the three font stacks of 2.2, which section 14 row 8 records as this doc's layer. Any further L2 token fails the gate until it is named here, and each accepted addition is printed with its source so the allowlist cannot grow silently.

---

## 16. Cross-references

- [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) - authoritative on screens, the five state kinds, the five content classes and their badge strings, fixed strings, and core token values. This doc never overrides it, and section 14 records every point of contact.
- [`01-DECISIONS.md`](01-DECISIONS.md) - C2, C3, C5, D17, D18, D21, D32, D47, and D56 are cited throughout; section 15 proposes D63 and D64.
- [`15-GLOSSARY.md`](15-GLOSSARY.md) - the canonical vocabulary this doc uses, including Assignment Map node, Checklist item, Milestone, Query, Publish, Insufficient data, and `Anonymous Student #N`.
- [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) - WP-01 owns the toolchain, the font self-hosting, and the offline boot this doc's typography depends on.
- [`04-TECH-ARCHITECTURE.md`](04-TECH-ARCHITECTURE.md) - the stack that `AGENTS.md` section 5.1 fixes and that section 7 reconciles the shadcn policy against.
- [`12-OPERATIONS.md`](12-OPERATIONS.md) - the offline and no-network constraints that make committed woff2 files the only acceptable font path.
- [`../AGENTS.md`](../AGENTS.md) - C1-C8, section 5.1, section 5.3, section 5.4.
