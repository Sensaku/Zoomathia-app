# Design system

> Decided during the design session of 2026-11-15. Every rule is **Decided** unless marked **Proposed**.
> There are **no separate mockups**: screens are designed directly in code, from this design system and the component catalogue. This document is the reference for every visual change.

## Principles

1. **Reading comes first.** Long reading sessions of ancient texts must be comfortable and pleasant; everything else serves the text.
2. **Keep and formalize the current identity**, "ink and parchment": warm neutrals, a bronze accent, a classical display font, square corners. It continues the visual heritage of the previous application (the Nile mosaic of Palestrina, the bronze accent).
3. **Accessible by design** (RGAA): low vision, browser zoom, keyboard use, colour-vision deficiencies.
4. **A calm interface.** Annotations and tools appear when needed and never compete with the text.
5. **One source for every visual value:** design tokens. No hex literal in components (about 1,600 today, migrated progressively).

## Design tokens

Tokens are declared once in `frontend/src/index.css` with Tailwind's `@theme`. Components use token classes only.

### Colours

The current palette, formalized. Contrast ratios are measured against the page background (`paper`).

| Token | Value | Use | Contrast on `paper` |
|---|---|---|---|
| `ink` | `#2c2724` | Body text, headings | 14.3:1 |
| `ink-muted` | `#595248` | Secondary text | 7.5:1 |
| `ink-subtle` | `#736a5f` | Metadata, captions; not on `paper-sunken` | 5.1:1 (4.4:1 on `#f0eae0`) |
| `ink-faint` | `#8c8275` | Decoration and disabled states only, **never text** | 3.65:1 |
| `accent` | `#9A6530` | Links, primary actions, focus ring | 4.75:1 |
| `accent-strong` | `#855424` | Hover and active states | 6.2:1 |
| `paper` | `#fcfbf9` | Page background | — |
| `paper-raised` | `#faf9f6` | Panels | — |
| `paper-sunken` | `#f4ede2`, `#f0eae0` | Selected rows, side panels | — |
| `rule` | `#ded5c6` | Decorative separators only | 1.4:1 |
| `rule-strong` | *to define* | Input and control borders | ≥ 3:1 required |

- Body text reaches at least **4.5:1**; large text, icons, control borders and focus indicators at least **3:1**.
- **Known gaps to fix:** `#8c8275` is used about 100 times as a text colour (3.65:1, below AA). The current input borders (`#ded5c6`, `#cfc5b4`, 1.4:1 and 1.65:1) are below the 3:1 required for control boundaries: `rule-strong` must be darker.
- White text on `accent` reaches 4.9:1: acceptable for buttons.

### Annotation categories

Current colours: animal (amber), behaviour (indigo), anatomy (rose), place (teal), person (sky), general (stone).

- **Colour is never the only cue.** Each category also has an icon in badges and lists, and a distinct underline style in the text. *Proposed:* solid, dashed, dotted, double, wavy and thin, assigned with the first implementation.
- Teal, sky and indigo can be confused with some colour-vision deficiencies: check the palette with a simulator and adjust within the identity.
- In forced-colours mode (Windows high contrast), backgrounds disappear: underlines and icons must remain visible.

### Typography

| Token | Fonts | Use |
|---|---|---|
| `font-display` | Cinzel | Page titles and section headings, sparingly; never body text |
| `font-text` | Cardo, EB Garamond | Ancient texts (polytonic Greek, Latin) and long reading |
| `font-ui` | System UI stack | Interface: menus, forms, buttons |
| `font-mono` | System monospace | SPARQL, identifiers, URIs |

- **The root font size is set in `%`, never in `px`,** so the size chosen by the user in the browser is respected. Today `html { font-size: 17.5px }` overrides it: to fix.
- **Reading text:** 1.125 to 1.25 rem, line height 1.7 to 1.85, line length 60 to 75 characters (`max-width` around `70ch`).
- Ancient texts declare their language (`lang="grc"`, `lang="la"`), and fonts must cover polytonic Greek (Cardo does).
- Fonts are self-hosted: no Google Fonts.

### Spacing, shape, elevation, icons

- Spacing follows Tailwind's 4 px scale; reading columns get generous margins.
- **Square corners** (`rounded-none`) by default, as today. *Proposed exception:* circular avatars and status dots.
- Borders rather than shadows; shadows only for floating layers (dialogs, popovers, menus).
- Icons come from `lucide-react` (16 or 20 px) and always have a visible label or an accessible name.

## Reading experience

- **Desktop layout:** three columns (table of contents, text, annotations panel). The side panels can be collapsed to give the text the full width.
- **Table of contents for long reading:** it shows the current position as the reader scrolls, jumps to any book, chapter or paragraph, and the URL always contains the passage, so a reload or a shared link reopens the same place.
- **Text first:** annotations are discreet by default (category underline); details appear on hover, focus or click. The pinned-concept banner stays the way to follow one concept through a text.
- **Contributions awaiting review are hidden by default** and appear, marked "non relu", when the reader enables the corresponding filter (RM-ACC-03).
- The reader already offers a text size control (A, A+, A++). *Proposed:* add line spacing, and a choice between original and translation side by side or one at a time.

## Responsive design and zoom

- **Desktop first** for annotation and expert tools. **Tablet and mobile** for comfortable reading and search: a single column, the table of contents in a drawer, annotations in a bottom sheet.
- **Low vision and zoom:** every screen stays usable at 200 % browser zoom (RGAA 10.4) and reflows at 320 CSS px width without horizontal scrolling (RGAA 10.11), except the SPARQL editor and data tables.
- User preferences are respected: browser font size (root in `%`), `prefers-reduced-motion`, `forced-colors`.
- **No dark mode** for now (not selected).

## Print

A print stylesheet prints the passage with its citation (author, work, reference, URL, date) and its annotations as footnotes, and hides navigation, panels and buttons.

## States and feedback

- Every data view designs its **loading** state (skeletons shaped like the content, not spinners over text), its **empty** state (why it is empty and what to do) and its **error** state (plain-language message and a retry action).
- Actions give immediate feedback; destructive actions ask for confirmation.
- **Contribution status** (validated, awaiting review, AI suggestion, retracted) is shown with a label and an icon, plus the author and the date.

## Public visibility

- Every page has its own `<title>` and meta description. Works and passages expose Open Graph metadata (title, author, excerpt) for link previews. *Proposed:* since the frontend is a single-page application, this needs prerendering or server-side metadata injection for shareable routes. Evaluate first the prerendering offered by React Router (framework mode), already a mandatory dependency, before any other tool.
- **Stable, citable URLs** for every work, section and paragraph, with a "cite this passage" action. *Proposed formats:* plain text and BibTeX.
- *Proposed:* structured data (schema.org) for works and for the open dataset.
- The data licence (CC BY 4.0) appears in the footer and in exports.

## Partners and institutions

- The footer shows the logos of the supervising institutions and funders, from `frontend/public/logos/`, using official files only, without recolouring, with the clear space and minimum size required by each charter. Their order and wording are validated with the institutions.
- Each logo has alternative text (the institution's name) and links to its site.

## Component catalogue

- With no separate mockups, the **component catalogue is the visual reference**: every shared component (`src/shared/ui/`) is shown with its variants and states (default, hover, focus, disabled, loading, error).
- A new screen is assembled from catalogue components first. A new shared component enters the catalogue in the same change.
- **Tool, to choose at adoption** under the dependency policy: Storybook (the standard; accessibility add-on based on axe, Vitest integration; heavier) or Ladle (light, Vite-native, same story format; fewer add-ons). *Proposed:* Storybook.

## Checklist for a visual change

1. Tokens only: no hex literal, no arbitrary value without a documented reason.
2. Contrast at least AA; reading line length within limits; usable at 200 % zoom.
3. Keyboard: reachable, visible focus, logical order.
4. Colour is never the only cue.
5. Loading, empty and error states designed.
6. French and English texts both fit (French is often longer).
7. Mobile and print checked when the screen is concerned.
