# 17  --  Design System

**Purpose.** Define the visual and interaction language for Assignment Assistant: the aesthetic direction, typography, token architecture, component governance, motion, accessibility mechanics and quality gates.

**What this doc owns.** The layer *above* `07-UI-UX-SPEC.md` (aesthetic direction, type, surface and texture, composition, motion, iconography) and the layer *below* it (primitive tokens, the shadcn policy, component inventory and variant rules, accessibility mechanics, quality gates).

**What this doc does not own.** Screen inventory, per-screen state tables, the five state kinds, the five content classes and their badge strings, and the core semantic hex values. Those belong to [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) S2 and win on any conflict.

**Status.** Committed design contract. Tokens are named here; hex values may be tuned without changing this doc's structure.

---

## 1. Aesthetic direction

**Institutional Editorial.**

A university-press sensibility with engineering-document precision: the calm authority of a printed course handbook, the clarity of a well-set technical standard, and the discipline of a system that never decorates for its own sake.

### Why this direction, and not an "AI product" look

This product's entire credibility rests on one claim:

> The original assignment brief is authoritative, and the AI's interpretation is clearly not.

`AGENTS.md` C2 and decisions D17/D18 make that the sharpest line in the product. A generic SaaS aesthetic  --  soft purple gradients, floating cards, glassy surfaces, uniform rounded corners  --  would actively undermine it. It would make the AI's output look like the product, and the official brief look like content.

The interface must therefore read as a *considered institutional document* in which two kinds of material are visibly, structurally different. The design carries the product's integrity argument. That is the whole thesis.

### DFII evaluation

`DFII = (Aesthetic Impact + Context Fit + Implementation Feasibility + Performance Safety) - Consistency Risk`

| Dimension | Score | Reasoning |
|---|---:|---|
| Aesthetic Impact | 4 | Editorial document typography is distinctive in an education-tooling space dominated by dashboard SaaS, but it is a restrained rather than spectacular direction. |
| Context Fit | 5 | Institutional credibility is exactly what a tutor evaluating a marking aid, and a student trusting an AI boundary, need to feel. |
| Implementation Feasibility | 4 | Achievable with Tailwind, `next/font` and owned components. The one real cost is hand-building the five content-class surfaces rather than adopting library primitives. |
| Performance Safety | 5 | No heavy effects. Paper grain is one small inline SVG. Fonts are self-hosted and subset. Motion is CSS-first. |
| Consistency Risk | 3 | The risk is typography drift: developers reaching for one family everywhere instead of preserving the T1 serif / UI sans split. Mitigated by the type-scale table in S3 and gate G3 in S9. |
| **DFII** | **15** | Excellent: execute fully. |

### The two-direction constraint

This is a **minimalist/editorial** direction with **industrial/utilitarian** accents for metadata. Those are the only two blended. No third direction is admitted.

---

## 2. The differentiation anchor

With the logo removed, the product should still be recognisable by this:

> **The authority grammar.** The official brief is a solid-framed, serif-set document page with a visible page anchor and a faint paper grain. Beside it, the AI's interpretation is a dashed, amber-tinted panel carrying a permanent uppercase badge. The two are never confused, and the visual difference is legible in greyscale.

This is the design expression of `07` S2.2. It is the one thing a viewer should remember 24 hours later.

### Worked example: one requirement against its interpretation

```text
+--------------------------------------------------------------+
|  ORIGINAL ASSIGNMENT BRIEF                     [ source bar ] |
|  ============================================================ |
|                                                              |
|  3.2  API Design                                             |
|                                                              |
|  Candidates must design a REST interface for the booking     |
|  domain, document each endpoint, and justify the chosen      |
|  authentication strategy.                                    |
|                                                              |
|  Source: assignment-brief.pdf, page 4                        |
+--------------------------------------------------------------+
        |  solid 1px border, 4px solid left rule
        |  serif body, paper grain, #FFFFFF
        v
+--------------------------------------------------------------+
| AI-GENERATED INTERPRETATION - NOT THE OFFICIAL REQUIREMENT    |
|  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  |
|                                                              |
|  Milestone 3 - API Design                                    |
|  - Understand the documented endpoint requirements           |
|  - Identify the authentication options the brief names       |
|  - Verify your endpoint list against section 3.2             |
|                                                              |
|  Refer to the original brief for exact requirements.          |
+--------------------------------------------------------------+
        dashed 1px border, 4px dashed left rule, amber tint
```

Four differences carry the distinction, so it survives greyscale and colour-blindness:

| Property | T1 official | T5 interpretation |
|---|---|---|
| Border style | solid | dashed |
| Left rule | 4px solid | 4px dashed |
| Surface | pure white + paper grain | amber tint, no grain |
| Typography | editorial serif body | UI sans body |
| Badge | `ORIGINAL ASSIGNMENT BRIEF` | `AI-GENERATED INTERPRETATION - NOT THE OFFICIAL REQUIREMENT` |

---

## 3. Typography

### Families

| Role | Family | Why |
|---|---|---|
| **Editorial display + document body** | **Newsreader** (Google Fonts, variable) | Designed for on-screen reading with an editorial, bookish voice. It makes an official brief feel like a document rather than a data field. Ships optical sizes and a true italic for quoted material. |
| **UI sans** | **IBM Plex Sans** (variable) | Institutional and humanist without being corporate-generic. Excellent legibility at 13-15px, drawn from a family with a matching mono so numeric alignment is consistent. Not Inter, not Roboto, not a system stack. |
| **Monospace** | **IBM Plex Mono** | Pairs with Plex Sans by design. Used for ids, timestamps, request ids and `Anonymous Student #N`, where digit alignment and unambiguity matter. |

**Considered alternatives.** `Source Serif 4` for display (excellent, slightly more neutral  --  rejected as less distinctive at heading sizes). `Instrument Sans` for UI (attractive, but no matching mono, which would force a third family).

**Banned as defaults.** Inter, Roboto, Arial, Helvetica, `system-ui`. A fallback stack must be declared, but a rendered screenshot must never be attributable to them.

### Loading

Self-host via `next/font/google` with `display: 'swap'` and explicit subsets. No runtime CDN request: the demo must work with the network off (`docs/11` WP-01, `docs/12` S6).

```ts
// app/src/app/fonts.ts
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

export const editorial = Newsreader({
  subsets: ['latin'], display: 'swap', variable: '--font-editorial',
});
export const ui = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400','500','600'], display: 'swap', variable: '--font-ui',
});
export const mono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400','500'], display: 'swap', variable: '--font-mono',
});
```

### Type scale

`07` S2.3 fixes the baseline sizes. This table assigns the family and the role; sizes are unchanged except where noted.

| Role | Family | Size / line-height | Weight | Tracking | Used by |
|---|---|---|---|---|---|
| Display | editorial | 34px / 1.2 | 500 | -0.01em | Login and dashboard hero only |
| Heading 1 | editorial | 28px / 1.25 | 500 | -0.01em | Screen titles, document section titles |
| Heading 2 | editorial | 20px / 1.3 | 500 | 0 | Panel and document subheads |
| Heading 3 | ui | 16px / 1.4 | 600 | 0 | Card titles, milestone names |
| Body | ui | 15px / 1.5 | 400 | 0 | Default UI text |
| Body tight | ui | 14px / 1.45 | 400 | 0 | Tables, dense lists |
| **Document body** | **editorial** | 16px / 1.65 | 400 | 0 | T1 brief and rubric text only |
| Quote | editorial italic | 16px / 1.6 | 400 | 0 | Verbatim requirement quoted inside a T5 panel |
| Badge | ui | 11px / 1.2 | 600 | 0.06em, uppercase | All content-class badges |
| Mono | mono | 13px / 1.5 | 400 | 0 | Ids, timestamps, request ids, `Anonymous Student #N` |
| Mono tight | mono | 12px / 1.4 | 400 | 0 | Secondary metadata under a card |

**The one rule that matters:** document body is `editorial` and UI body is `ui`. Rendering T1 text in the UI sans, or T5 content in the editorial serif, is a defect  --  it collapses the authority grammar into a font choice.

---

## 4. Token architecture

Three layers. Components may reference **semantic** and **component** tokens only; a component that hard-codes a hex value is a defect (gate G2).

### 4.1 Primitive layer (new in this doc)

Raw material. Never referenced from a component.

```css
:root {
  /* Paper - the neutral system. Warm, low-chroma, not grey-blue. */
  --paper-0:   #FFFFFF;
  --paper-25:  #FCFCFB;
  --paper-50:  #F8F8F6;
  --paper-100: #F1F1EE;
  --paper-200: #E4E4DF;

  /* Ink - one dark institutional family. */
  --ink-900: #14181D;
  --ink-800: #2A2F36;
  --ink-700: #444B54;
  --ink-400: #7A828C;

  /* Institutional blue: authority marks, links, focus. */
  --blue-50:  #EFF4F9;
  --blue-700: #1F4E79;

  /* Approved green: tutor-published and approved structure. */
  --green-50:  #F0FBF4;
  --green-700: #027A48;

  /* Amber: AI interpretation and every attention state. One accent only. */
  --amber-50:  #FFF8EC;
  --amber-700: #B54708;

  /* Slate: peer content, deliberately the weakest accent. */
  --slate-50:  #F4F5F7;
  --slate-600: #475467;

  /* Status */
  --red-700: #B42318;

  /* Geometry and depth */
  --radius-card: 6px;
  --radius-badge: 4px;
  --shadow-card: 0 1px 2px rgba(20, 24, 29, 0.06);
  --shadow-raised: 0 4px 12px rgba(20, 24, 29, 0.08);
  --focus-ring: 0 0 0 2px var(--paper-0), 0 0 0 4px var(--blue-700);
}
```

### 4.2 Semantic layer

Owned by [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) S2.3. Reproduced here **only** as the mapping from primitive to semantic so the relationship is legible; `07` remains the authority on the values.

| Semantic token | Maps to | Carries |
|---|---|---|
| `--surface-page` | `--paper-50` | App background |
| `--surface-card` | `--paper-0` | Cards, panels, lists |
| `--surface-official` | `--paper-0` + grain | T1 official document |
| `--surface-approved` | `--green-50` | T2 tutor-published, T3 approved structure |
| `--surface-interpretation` | `--amber-50` | T5 AI interpretation |
| `--surface-peer` | `--paper-0` | T4 peer discussion |
| `--border-official` | `--blue-700` (solid) | T1 frame, 4px left rule |
| `--border-approved` | `--green-700` (solid) | T2/T3 frame, 4px left rule |
| `--border-interpretation` | `--amber-700` (dashed) | T5 frame, 4px dashed left rule |
| `--border-peer` | `--slate-600` (dotted) | T4 frame |
| `--text-primary` | `--ink-900` | Body copy |
| `--text-secondary` | `--ink-700` | Supporting copy |
| `--state-error` | `--red-700` | Error state |
| `--state-warning` | `--amber-700` | Warning state and refusals |
| `--state-success` | `--green-700` | Success and resolved |
| `--state-info` | `--blue-700` | Focus and informational |

### 4.3 Component layer

Per-component tokens, defined where the component lives, always derived from S4.2. Example for the badge:

```css
.badge--interpretation {
  background: var(--surface-interpretation);
  color: var(--amber-700);
  border: 1px dashed var(--border-interpretation);
  border-radius: var(--radius-badge);
  font: 600 11px/1.2 var(--font-ui);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
```

### 4.4 Texture: paper grain on T1 only

The official brief gets a faint grain so it reads as a physical document. Applied to T1 surfaces **only**  --  never to T5, never to cards, never to the app shell.

```css
.surface-official {
  background-color: var(--surface-official);
  background-image: url("data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>\
<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/>\
<feColorMatrix type='saturate' values='0'/></filter>\
<rect width='120' height='120' filter='url(%23g)' opacity='0.035'/></svg>");
}
```

One 120x120 inline SVG, no network request, no layout cost, `opacity` kept at 0.035 so it never reduces text contrast. It must be verified against gate G6.

### 4.5 Composition

- **Asymmetry over centred symmetry.** The workspace is a two-column authority layout on wide screens: official document on the left, interpretation and progress on the right. The columns are deliberately unequal (approximately 58 / 42) so the eye reads the brief as primary.
- **Below 900px** the layout collapses to a single column with the official document first (`07` S4.3).
- **Spacing rhythm:** 4 / 8 / 12 / 16 / 24 / 32 / 48. Prefer generous vertical rhythm around documents and dense rhythm inside tables.
- **Density:** the tutor analysis view is dense and tabular; the student workspace is airy. Density is a property of the surface, not a global preference.
- **Borders over shadows.** Structure is expressed with rules and borders, not floating cards. `--shadow-card` is used once per card, never for depth theatre.

---

## 5. shadcn/ui policy

The team wants shadcn for velocity. `AGENTS.md` S5.1 forbids *"a component library that supplies its own design language wholesale"*, and a general design standard treats default shadcn/Tailwind layouts as generic. Both concerns are real, and both are addressable.

### The rule

**shadcn is permitted only as vendored, owned source that we re-theme. Its default appearance must be unreachable in the shipped UI.**

1. Adopt components with the CLI; they land in `app/src/components/ui/` and are ours to edit.
2. Set the theme once (CSS variables in S4 above map onto shadcn's `--background`, `--foreground`, `--primary`, `--border`, `--ring`, `--radius`).
3. Re-theme every adopted component to our tokens. Default radius, default greys and the default focus ring are all replaced.
4. **No component may be dropped into a screen unreviewed.** Adoption is a starting point, not a finish.

Enforcement: a grep gate in CI rejects `from '@/components/ui/` imports whose component file still matches the pristine shadcn template (gate G1, S9).

### Adopt vs hand-build

| shadcn component | Decision | Note |
|---|---|---|
| Dialog, AlertDialog | Adopt | Behaviour is the hard part; appearance is themed |
| Popover, Tooltip, DropdownMenu, ContextMenu | Adopt | Accessibility of focus and dismissal is expensive to hand-build |
| Tabs | Adopt | The workspace and tutor tabs depend on correct keyboard semantics |
| Select, Combobox, Command | Adopt | |
| Sheet, Drawer | Adopt | Mobile navigation and the assistant panel |
| Form + react-hook-form + zod | Adopt | Validation wiring is pure overhead |
| Input, Textarea, Label, Checkbox, RadioGroup, Switch | Adopt | Re-themed to a 6px radius and our border colour |
| Button | Adopt | Variants redefined in S6.1 |
| Badge | Adopt, restyled | Must not use shadcn's default pill or colour set |
| Skeleton | Adopt | Shape must match the final layout (`07` S2.1) |
| Progress | Adopt | Used only for ingestion and upload progress |
| ScrollArea | Adopt | |
| Sonner / Toast | Adopt | Used only for transient confirmations, never for errors or refusals |
| Table | Adopt, heavily restyled | Tutor analysis density comes from our own cell rules |
| Avatar | Adopt | Used for tutor identity only, never for anonymous students |
| Accordion | Adopt | Grouped tutor queries |
| **Card, Panel, Surface** | **Hand-build** | Carries the five content classes. Its default border and radius carry a design language we reject. |
| **Alert** | **Hand-build** | Default look collapses error, warning and refusal into one treatment. We need three distinguishable ones. |
| **Empty state, insufficient-data panel, refusal panel, no-grounding notice** | **Hand-build** | These are product-defining states (`07` S2.1, S2.2), not generic components. |
| **Any component rendering T1-T5 content** | **Hand-build** | The authority grammar must not be delegated to a library |
| **Assignment Map tree** | **Hand-build** | Accessible tree semantics plus source deep-links; no library fits |

### Alternatives considered

| Option | Why not |
|---|---|
| **Radix Primitives directly** (what shadcn wraps) | Honest and lighter, but we would rebuild the form wiring, variants and theming that shadcn already solved. Adopt shadcn and delete what we dislike. |
| **Park UI / Ark UI** | Strong accessibility story, but a smaller ecosystem and a more opinionated visual layer to strip out. |
| **Tailwind alone, zero component layer** | Cleanest fit for `AGENTS.md` S5.1 and the most control, but the accessibility cost (focus traps, roving tabindex, dismissal behaviour) is real for a weekend build. This is the fallback if the shadcn theming consumes too much time. |
| **MUI / Chakra / Mantine** | Supply a design language wholesale. Rejected outright by S5.1. |

---

## 6. Component inventory

| Component | Source | Variants | States covered | Behaviour specified by |
|---|---|---|---|---|
| Button | shadcn re-themed | primary, secondary, ghost, destructive | default, hover, focus, active, disabled, loading | `07` S2.6 |
| Badge (content class) | shadcn re-themed | official, approved, interpretation, peer, warning, neutral | static | `07` S2.2 |
| Surface / Panel | hand-built | official, approved, interpretation, peer | static | `07` S2.2 |
| State panel | hand-built | loading, empty, error, insufficient-data, refused | one per kind | `07` S2.1 |
| Refusal panel | hand-built | refuse, unavailable (`POL_ABSENT`) | static | `07` S4.7.3 |
| Milestone list / item | hand-built | locked, available, in-progress, complete, reopened | all | `07` S4.6 |
| Checklist item row | hand-built | unchecked, checked, reopened | + keyboard toggle | `07` S4.6 |
| Assignment Map tree | hand-built | requirement node, milestone node, current-position marker | collapsed, expanded, selected, current | `07` S4.3 |
| Source link | hand-built | inline, block | default, hover, focus | `07` S4.2, D43 |
| Query thread card | hand-built | unanswered, answered, resolved | + reply composer | `07` S5 |
| Reply vs Publish control | hand-built | reply, publish | default, confirm | `07` S5, D24 |
| Discussion post | hand-built | attributed, anonymous, own, flagged | edit, delete, reply | `07` S6 |
| Composer | shadcn Textarea + form | assistant, query, discussion | typing, submitting, error | `07` S4.7, S5, S6 |
| Upload chip | hand-built | uploading, scanning, clear, blocked | all four | `07` S4.7.2 rule 5, `05` S6.4 |
| Ingestion stage list | hand-built | pending, running, done, failed | all | `07` S7.2 |
| Metrics table | shadcn Table restyled | milestone row, summary row | normal, insufficient-data | `08` S8 |
| Difficulty signal card | hand-built | single, multiple | static | `08` S5.3 |
| Toast | shadcn Sonner | success, info | transient only | `07` S2.1 rule 4 |
| Modal / Dialog | shadcn | confirm, edit artifact | open, saving, error | `07` S7.3 |

### 6.1 Button variants

| Variant | Use | Appearance |
|---|---|---|
| primary | The single main action on a surface | `--blue-700` fill, white text, 6px radius |
| secondary | Alternative actions | transparent fill, 1px `--border-default`, `--text-primary` |
| ghost | Inline and toolbar actions | no fill or border until hover |
| destructive | Tutor removal actions only | `--red-700` text, transparent fill; **filled only inside a confirmation dialog** |

One primary button per surface. Two primary buttons on one screen is a design defect.

---

## 7. Motion

**Philosophy.** Motion explains a state change; it never performs personality. A student anxious about asking a question should not be met with animation.

| Interaction | Duration | Easing | Notes |
|---|---|---|---|
| Panel or drawer entrance | 180ms | `cubic-bezier(0.2, 0, 0, 1)` | The one entrance sequence: the assistant panel slides from the lower right and fades |
| Hover / focus colour change | 120ms | `ease-out` | |
| Tab content swap | 150ms cross-fade | `ease-out` | No slide  --  sliding implies spatial order that tabs do not have |
| Milestone completion | 200ms | `ease-out` | A single checkmark stroke draw. Fires once, never loops |
| Toast | 150ms in, 120ms out | `ease-out` | |
| Skeleton shimmer | prefers reduced-motion aware | linear | Suppressed entirely under reduced motion |

**Hard rules.**

1. No looping, decorative or ambient animation anywhere.
2. No animation on the authority grammar. Borders and badges appear; they do not animate in.
3. Every transition has a `@media (prefers-reduced-motion: reduce)` path that removes transform and opacity animation and leaves the state change instant.
4. Motion never delays an action. A user never waits for an animation to finish before they can act.

---

## 8. Accessibility mechanics

`07` S2.1 sets the requirements; this section sets the mechanics.

- **Contrast.** Body text on any surface >= 4.5:1. The specific risk is `--amber-700` (`#B54708`) on `--amber-50` (`#FFF8EC`), which sits near the boundary at badge size. Badges must be tested at 11px and, if any ratio falls below 4.5:1, the badge text uses `--ink-900` while the amber carries the border and tint.
- **Never colour alone.** Enforced by `07` S2.1 rule 1. The greyscale test (gate G6) is the check.
- **Focus.** `--focus-ring` is a 2px white inner ring plus a 2px `--blue-700` outer ring, so it survives on both white documents and tinted panels. Never `outline: none` without a replacement.
- **Assignment Map keyboard model.** A `role="tree"` with roving `tabindex`: ArrowUp/ArrowDown move between visible nodes, ArrowRight expands or enters, ArrowLeft collapses or exits, Home/End jump to first/last, Enter follows the source link. The "you are here" marker is announced, not only drawn.
- **Live regions.** Loading completion, errors and refusals are announced. Refusals use `role="status"` with polite priority  --  a refusal is designed behaviour, not an emergency, and must not interrupt a screen reader mid-sentence.
- **Reduced motion.** One global query; no component opts out silently.
- **Target size.** Interactive targets >= 44x44 CSS px on touch surfaces, including the checklist toggle and the upload chip's remove control.
- **Zoom.** Usable at 200% with no loss of function, per `07` S2.7.

---

## 9. Quality gates

Checkable rules. A pull request that fails one of these is not done.

| # | Gate | Check |
|---|---|---|
| **G1** | No pristine shadcn component is rendered | Grep gate: any file under `components/ui/` that still matches the upstream template fails CI |
| **G2** | No hard-coded colour in a component | Lint: hex values and `rgb(` outside `globals.css` fail |
| **G3** | Authority grammar preserved | T1 body renders in the editorial serif; T5 body renders in the UI sans; a screenshot diff asserts both |
| **G4** | Document typography never used for UI, and vice versa | Review + the G3 screenshot diff |
| **G5** | No banned font is the effective fallback | Assert the computed `font-family` on `body`, `h1` and `code` |
| **G6** | Greyscale test | With saturation removed, all four content-class treatments remain distinguishable by border style and badge text |
| **G7** | Every T5 element carries its badge at every breakpoint | Visual check at 375px, 768px, 1280px |
| **G8** | Contrast | Body >= 4.5:1; badge text verified at 11px; the amber-on-amber pair explicitly tested |
| **G9** | Reduced motion | With `prefers-reduced-motion: reduce`, no transform or opacity animation runs |
| **G10** | One primary button per surface | Review check on every screen |
| **G11** | Offline fonts | With the network disabled, both families render (self-hosted, not CDN) |

---

## 10. Anti-patterns

Immediate failure. If a screen looks like a template, restart the screen.

1. Purple, violet or blue-to-purple gradients anywhere.
2. Glassmorphism, backdrop blur used as decoration, or translucent floating layers.
3. Uniform large border radius, or border radius applied to the content-class surfaces (they use rules, not pills).
4. Shadows used for depth theatre; more than one soft shadow per surface.
5. Inter, Roboto, Arial or `system-ui` as the effective rendered font.
6. Rendering T5 interpretation in the editorial serif, or T1 brief text in the UI sans.
7. Removing or shortening a content-class badge for layout reasons.
8. Any card that mixes two content classes without an explicit boundary between them.
9. Emoji as interface icons. Icons come from Lucide at 16px, 1.5 stroke.
10. Looping or ambient animation; confetti; celebratory effects on quiz-like interactions.
11. Colour as the only signal for any state.
12. A second primary button on one surface.
13. Toasts used for errors or refusals  --  those are panels (`07` S2.1).
14. Dense tabular styling applied to the student workspace, or airy spacing applied to tutor analytics.
15. Paper grain on anything other than a T1 surface.

---

## 11. Cross-references

| Doc | Relationship |
|---|---|
| [`07-UI-UX-SPEC.md`](07-UI-UX-SPEC.md) | **Authoritative** on screens, state kinds, content classes, badges and semantic token values. Wins on any conflict with this doc. |
| [`01-DECISIONS.md`](01-DECISIONS.md) | D17/D18 (verbatim brief vs interpretation), D47 (unavailable assistant), D56 (metric naming). |
| [`15-GLOSSARY.md`](15-GLOSSARY.md) | Canonical vocabulary for every term used in UI copy. |
| [`11-BUILD-PLAN.md`](11-BUILD-PLAN.md) | WP-01 (theming and fonts), WP-07 (student workspace surfaces), WP-06 (tutor review surfaces). |
| [`AGENTS.md`](../AGENTS.md) | S5.1 (component-library constraint), S5.3 (naming and style), S4.3 (verify before claiming done). |
