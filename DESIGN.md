---
name: CostAdvisor
description: Buyer-side procurement cost intelligence — know what your products should cost before your supplier tells you.
colors:
  primary: "#00A99D"
  primary-light: "#00c8bc"
  primary-dim: "#e6f7f6"
  danger: "#d64545"
  amber: "#c8911a"
  blue: "#2596be"
  purple: "#7c5cbf"
  bg: "#f5f7fa"
  surface: "#ffffff"
  surface-inset: "#eef2f6"
  border: "#d6dde4"
  text: "#333333"
  text-secondary: "#4a4a4a"
  muted: "#666666"
  on-primary: "#ffffff"
typography:
  display:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "clamp(40px, 5.5vw, 72px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.5vw, 40px)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "3px"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "20px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  xl: "64px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "11px 22px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "11px 22px"
  button-outline-hover:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "11px 22px"
---

# Design System: CostAdvisor

## 1. Overview

**Creative North Star: "The Analyst's Instrument"**

CostAdvisor's visual language is a precision instrument on a clean desk — not a dashboard, not a startup pitch, not a Bloomberg terminal cosplay. It is the kind of tool a seasoned Category Manager trusts because it does not try to impress: it delivers. Every design decision is tested against a single question: does this feel like something a CPO would put in front of an enterprise IT review board?

The canonical theme is **StaminaChem light** — a cool near-white background (#f5f7fa) with a committed teal accent (#00A99D). The palette is restrained everywhere except at the accent: one saturated color, one role, one voice. The rest of the surface is architectural: surfaces, borders, and type. The teal earns its presence precisely because it does not share the screen.

The typeface choice is the most distinctive and deliberate decision in the system: JetBrains Mono as the body font. This is not a shorthand for "dev tool" — it is a statement about the user. Procurement analysts work with numbers, indices, commodity prices, and quarterly periods. Mono type brings the right register: every character has the same width, tables line up, numbers stack cleanly. Syne at 800 weight provides the display muscle — geometric, dense, authoritative — that stops the page from reading as a spreadsheet.

This system explicitly rejects: dark-mode neon gaming aesthetics, AI-hype glassmorphism, and the warm-neutral beige that signals "generic SaaS." It is not trying to look innovative. It is trying to look correct.

**Key Characteristics:**
- Cool near-white background with a single committed teal accent
- JetBrains Mono for all body copy and data labels — not as a developer signal, but as an analytical register
- Syne 800 for display and headlines only — maximum contrast with the mono body
- Flat-by-default surfaces with subtle shadow reserved for floating elements
- Section padding at 96px — deliberate breathing room, not padding-by-default
- Reduced-motion-first animation philosophy: all motion is progressive enhancement, content never gated behind a transition
- Four theme variants (dark / light / amber / StaminaChem) — the StaminaChem light theme is the canonical brand expression

---

## 2. Colors: The Procurement Intelligence Palette

One committed teal that earns its place by not appearing everywhere. Everything else is architectural.

### Primary
- **Procurement Teal** (`#00A99D`): The single saturated brand accent. Used on the logo wordmark, primary CTAs, active states, accent labels, positive delta values (price decreasing = buyer wins), and chart lines representing should-cost. Appears on approximately 10–15% of any given view.
- **Teal Surface Tint** (`#e6f7f6`): Very light teal wash used for dimmed accent backgrounds (hover states on ghost elements, active nav indicators, badge backgrounds). Never used as a card background.
- **Teal Light** (`#00c8bc`): Secondary teal — lighter saturation for accents-within-accents, commodity label for the labor/teal category. Not used in navigation or CTAs.

### Secondary
- **Danger Red** (`#d64545`): Supplier price increases, gap values (where supplier price > should-cost), error states, and the chart line representing the supplier's actual price. Appears only on negative signals; never decorative.
- **Amber** (`#c8911a`): Energy commodity category color; also used for warnings and info states. In the landing page section on commodity categories, this is the color associated with energy indices.

### Tertiary
- **Intelligence Blue** (`#2596be`): Metals commodity category; also used in the alternative dark-blue inline design layer for interactive elements. In the default StaminaChem theme, appears only as a commodity category label.
- **Chemical Purple** (`#7c5cbf`): Chemical commodity category. Reserved strictly for category identification; never used for interactive states.

### Neutral
- **Background** (`#f5f7fa`): The canvas — a cool near-white, not warm. The blue cast (hue toward ~220) is deliberate: it reads as clinical and competent, not as a "friendly" warm paper.
- **Surface** (`#ffffff`): Card backgrounds, modal surfaces, the nav glass. Pure white so cards lift cleanly off the near-white background.
- **Surface Inset** (`#eef2f6`): Recessed surfaces, KPI cells inside mockup cards, input backgrounds. Slightly cooler/darker than surface.
- **Border** (`#d6dde4`): All dividers, card outlines, input strokes. Subtle but structural.
- **Primary Text** (`#333333`): Body copy. Dark charcoal — not pure black, which reads too harsh on the light background.
- **Secondary Text** (`#4a4a4a`): Subtitles, secondary labels, lead paragraphs.
- **Muted** (`#666666`): Navigation links (default state), metadata, tertiary labels, descriptive text below headings.

### Named Rules

**The One Teal Rule.** The primary teal (#00A99D) carries exactly one role on any given view: either it is the button, or it is the label, or it is the chart line — never all three competing at once. The accent is rare; its rarity is the point.

**The Signal Color Rule.** Red (#d64545) means the supplier is charging more than they should. Green/teal means the buyer has leverage. These colors are not decorative — they carry analytical meaning. Never use danger red for a "download" button or an innocuous hover state.

**The Category Palette Rule.** The 7 commodity category colors (energy amber, chemical purple, labor teal, FX olive, metal blue, PPI pink, freight green) are reserved exclusively for commodity category identification in charts, legends, and data labels. They do not appear in UI chrome.

---

## 3. Typography

**Display Font:** Syne (weight 800 only, with fallback `system-ui, sans-serif`)
**Body / Data Font:** JetBrains Mono (weights 300–600, with fallback `monospace`)
**Label Font:** JetBrains Mono (same family; distinguished by size, weight, and letter-spacing)

**Character:** The pairing is confrontational by design. Syne at 800 — geometric, condensed, almost mechanical — is the only typeface in the system with personality. JetBrains Mono at 13px provides the analytical substrate: every character is the same width, numbers stack, indices align. The friction between the two families is intentional: it says this tool has a strong opinion and the data to back it up.

### Hierarchy

- **Display** (Syne 800, `clamp(40px, 5.5vw, 72px)`, line-height 1.04, letter-spacing -0.02em): Hero headlines only. Maximum one per page. `text-wrap: balance` required. At this weight and size, the type is architectural — it does not need ornamentation.
- **Headline** (Syne 800, `clamp(28px, 3.5vw, 40px)`, line-height 1.12, letter-spacing -0.015em): Section headings, the `.lp-h2` class. Used once per section.
- **Title** (Syne 700, 17px, line-height 1.3): Nav wordmark, card titles, modal headings. The inflection point between display and body — still Syne, but not shouting.
- **Body** (JetBrains Mono 400, 13px, line-height 1.7): All prose, lead paragraphs, description text. The `.lp-lead` style uses `color: var(--text-secondary)` at this size. Maximum line length 65ch.
- **Label** (JetBrains Mono 600, 10px, letter-spacing 3px, uppercase): The `.lp-label` class. Used sparingly as section eyebrows — in teal, on accent sections only. Not on every section.
- **Data / Mono** (JetBrains Mono 600–700, 9–22px): KPI values, trust stats, ticker values, chart axis labels. Font-family is the same as body; distinguished by weight and size only.

### Named Rules

**The Mono-as-Analytical-Register Rule.** JetBrains Mono is not chosen because this is a developer tool. It is chosen because the users are analysts who work with numbers. Every data value, index value, and period label uses mono. This should never be swapped out for a humanist sans "to feel more approachable." The mono is the voice.

**The One Display Family Rule.** Syne appears only at headline sizes (17px and above, weight 700+). Body copy, labels, and data labels are always mono. There are exactly two families in this system — never a third.

---

## 4. Elevation

CostAdvisor uses a **flat-by-default, shadow-for-state** elevation model. Surfaces at rest have no shadow. Elevation appears only on floating elements (the hero mockup card, modal dialogs, sticky nav on scroll, dropdown menus) and on elements that physically rise above the surface in response to state (hover).

The system is not purely flat — the nav uses `backdrop-filter: blur(18px)` glass for the sticky state, and the hero mockup card uses a real shadow — but these are structural uses of depth, not decoration.

### Shadow Vocabulary

- **Floating Card** (`0 24px 64px rgba(0,0,0,0.3)`): The hero product mockup card. This is the deepest shadow in the landing page system — the mockup is the literal focal point of the hero section and earns the lift.
- **Glass Nav** (`backdrop-filter: blur(18px)`): The sticky navigation bar uses blur + `rgba(245,247,250,0.92)` background rather than a shadow. The glass effect is functional (separates nav from scrolling content visually) not decorative.
- **Hover Lift** (`0 8px 32px rgba(0,0,0,0.12)`): Applied to interactive cards and showcase tiles on hover. Appears only as a response to state, never at rest.

### Named Rules

**The Flat-by-Default Rule.** Surfaces are flat at rest. A card with a shadow at rest signals "this can be picked up" — use it only when the card is truly interactive (clickable, expandable). Information cards are not interactive cards; they are flat.

**The One Glass Rule.** Backdrop-filter glass is used in exactly one place in the canonical brand theme: the sticky navigation bar. Applying it to section backgrounds, tooltip containers, or decorative panels is the AI-hype pattern this system explicitly rejects.

---

## 5. Components

### Buttons

Buttons use JetBrains Mono at 12px (standard) or 13px (large variant) — the mono font at button size reinforces the data/instrument register. Transition: 0.18s ease on all properties.

- **Shape:** Gently curved (8px radius — `--rounded-md`). Not pill-shaped, not square. The radius is functional: it identifies the element as interactive without overstating it.
- **Primary** (`background: #00A99D`, `color: #fff`, padding `11px 22px`): The single high-intent action on any given page section. The teal fills the button; on hover, the fill disappears and the teal becomes the text color against a transparent background. This inverted-on-hover behavior is deliberate — it makes the button feel like it's revealing the brand color underneath.
- **Primary Large** (padding `13px 30px`, font 13px): Hero CTAs and section-level primary actions.
- **Outline** (`background: transparent`, `border: 1px solid #d6dde4`, `color: #4a4a4a`): Secondary actions paired with a primary. Hover brings the border to `--muted` (#666) and text to primary (#333).
- **Ghost** (`background: transparent`, `color: #666666`, no border): Tertiary actions — "back", "view all", navigation-level links styled as buttons.

### Chips / Badges

- **Section Label Chip**: Not a chip in the UI sense — it is a text label in `#00A99D` uppercase at 10px, letter-spacing 3px, used sparingly as an eyebrow above one or two key headlines. Not repeated above every section.
- **Status Badge** (e.g., `CHALLENGE` / `LIVE`): Small pills with `border-radius: 4px`, font-size 10px, font-weight 700, background at 12% opacity of the status color. Used in the product mockup card and platform roadmap.
- **Theme Swatch Pill**: The theme switcher in the nav — a 20px pill containing 4 circular color swatches at 13px, with hover scale(1.25) and active outline ring.

### Cards / Containers

The hero product mockup card is the signature component of the landing page. It communicates the product without requiring a screenshot of the app.

- **Corner Style:** 16px radius (–radius-lg). Larger than UI buttons — the card is a container, not an affordance.
- **Background:** `var(--surface)` (#ffffff) on the `var(--bg)` (#f5f7fa) canvas.
- **Shadow:** `0 24px 64px rgba(0,0,0,0.3)` — the deepest shadow in the system. Earned.
- **Border:** `1px solid var(--border)` (#d6dde4).
- **Internal padding:** 24px 28px.
- **KPI cells inside the card:** Surface2 background (#eef2f6), 1px grid of border-color between cells. Mono type for all values.

### Navigation

- **Style:** Sticky, top-0, `backdrop-filter: blur(18px)` + `rgba(245,247,250,0.92)` background. Bottom border `1px solid #d6dde4`.
- **Height:** 58px.
- **Logo:** Syne 800, 17px, in primary teal — the only place the full teal wordmark appears in the nav.
- **Links:** JetBrains Mono 500, 11px, letter-spacing 0.4px, default color `--muted` (#666), hover to `--text-secondary` (#4a4a4a). No active underline; active state is a separate page or section treatment.
- **Mobile:** Burger button (34px × 34px, 1px border, 6px radius) replaces links below 640px. Expanded menu stacks full-width, 13px links with bottom dividers.
- **Theme swatches:** Pill at right of nav links (hidden on mobile). 4 colored circles, 13px diameter.

### Data Ticker

The commodity index ticker is a signature component — a horizontally scrolling strip of live index values that communicates "this platform tracks real markets" in one line. Each item: name (mono 12px muted), value (mono 13px 600 in primary text), change badge (mono 11px 600, green or red pill at 12% opacity). Animation: continuous leftward scroll at 28s linear infinite. Paused on `prefers-reduced-motion`.

---

## 6. Do's and Don'ts

### Do:

- **Do** use `#00A99D` (primary teal) for exactly one UI role per view — it signals that something is actionable or positive. Its rarity is its authority.
- **Do** use JetBrains Mono for all numerical data, index values, dates, and data labels — even when they appear in body paragraphs. Numbers in a proportional font look like copy; numbers in mono look like data.
- **Do** use `text-wrap: balance` on all Syne headlines (h1–h3) to prevent awkward last-word orphans at narrow viewports.
- **Do** keep the body background on the cool side (#f5f7fa, not warm/cream). The cool bias is the analytical register.
- **Do** use `prefers-reduced-motion: reduce` to kill all animations and show all content instantly — no JS required for the reduced-motion path.
- **Do** reserve `#d64545` (danger red) for analytically negative signals: price increases, gaps where the supplier is over-charging, error states. Never use it as a decorative accent.
- **Do** match section padding to 96px vertical — this is the breathing rhythm of the page. Smaller sections feel cramped; matching sections feel composed.
- **Do** place the product mockup card in a `perspective(900px)` 3D tilt at rest (`rotateX(8deg) rotateY(-6deg)`), removing the tilt on hover. This is the one permitted spatial effect and it earns its place as the hero's focal point.

### Don't:

- **Don't** use purple gradients, glowing neon, or neon-on-dark color combinations. This was explicitly named as an anti-reference. A procurement platform is not a gaming peripheral.
- **Don't** use particle backgrounds, animated mesh blobs, "powered by AI" hero badges, or glassmorphism applied to section backgrounds or decorative containers. These are the AI-hype patterns this brand explicitly rejects. Glass is used exactly once (the sticky nav) and nowhere else.
- **Don't** use warm-neutral backgrounds (cream, sand, beige, linen, parchment — anything in the `oklch(L>0.84, C<0.06, H 40–100)` band). The system uses cool near-white. Warm neutral reads as generic B2B SaaS, which is the wrong register.
- **Don't** add `border-left` or `border-right` greater than 1px as a colored stripe on cards, callouts, or list items. Use full borders, background tints, or leading category color dots instead.
- **Don't** use gradient text (`background-clip: text` with a gradient fill). All text is a single solid color.
- **Don't** repeat the section eyebrow label (`.lp-label` in teal uppercase) above every section heading. It appears once or twice on the page as a named-brand system element; repeated on every section it becomes AI scaffolding.
- **Don't** use a sans-serif font for body copy or data labels. The mono body is the analytical register — swapping to Inter or DM Sans "for readability" breaks the voice.
- **Don't** apply `box-shadow` to cards at rest. Shadow appears only on the hero mockup (because it is the design's focal point) and on hover states (because the user's cursor has elevated it). Flat cards stay flat.
- **Don't** use the 7 commodity category colors (energy amber, chemical purple, etc.) for interactive UI states, button variants, or section backgrounds. They are a data vocabulary, not a UI palette.
