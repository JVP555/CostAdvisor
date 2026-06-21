---
target: landing page
total_score: 21
p0_count: 1
p1_count: 3
timestamp: 2026-06-21T18-29-37Z
slug: landing-index-html
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading indicator on access-request form; demo step dots help but network feedback is absent |
| 2 | Match System / Real World | 3 | Procurement jargon ("should-cost," "commodity index") is correct for target audience; "AI negotiation briefs" in hero sub-headline contradicts brand's own anti-references |
| 3 | User Control and Freedom | 3 | Demo modal has close + step dots; mobile menu works; demo 3-step flow has no "back" button |
| 4 | Consistency and Standards | 1 | CRITICAL: Two competing design systems operating simultaneously — dark navy inline CSS vs StaminaChem light external CSS. Buttons, typography, colors, and glassmorphism usage all differ between sections |
| 5 | Error Prevention | 2 | Form validation is submit-only; no inline character limits; email format not validated live |
| 6 | Recognition Rather Than Recall | 3 | Anchored nav links, prominent CTAs, guided demo flow — well handled |
| 7 | Flexibility and Efficiency | 2 | Theme switcher is good personalization; keyboard nav works for nav elements; no power-user paths |
| 8 | Aesthetic and Minimalist Design | 2 | Animated blobs, multiple glass panels, gradient text, and side-tab border create visual noise competing with the core message |
| 9 | Error Recovery | 2 | Error div elements exist; generic messaging likely; per-field placement unclear |
| 10 | Help and Documentation | 1 | No in-page help; "should-cost" never defined; demo calculator sliders have no procurement context labels; no FAQ |
| **Total** | | **21/40** | **Acceptable — significant improvements needed** |

---

## Anti-Patterns Verdict

**Does this look AI-generated?**

**LLM assessment**: Partially. The hero copy ("Know what your products should cost before your supplier tells you") is strong and authentic — it does not read as AI-generated. The product mockup card is genuinely domain-specific. But several visual patterns immediately signal "AI assembled this": the animated mesh blobs (the exact pattern DESIGN.md explicitly bans), the gradient text on step numbers, the side-tab border on signal tiles, and the wall of identical icon+text feature cards. These are all catalogue items from the AI landing page playbook, and they sit uneasily next to the otherwise thoughtful product content.

The more significant tell: the page is running two completely separate design systems at once. Sections built with the inline CSS (hero, nav, how-it-works, features, security, CTA) look like a dark navy SaaS tool. Sections styled with the external `lp-*` CSS look like a different product. This is not what a design director would ship — it reads as two different design passes stitched together without reconciliation.

**Deterministic scan**: 2 hard violations + 1 font violation + 30+ advisory color/radius drifts from the documented design system.

- **side-tab** (warning): `border-left:3px solid var(--green)` on `.signal-tile` at line 337 — absolute ban
- **gradient-text** (warning): `background-clip: text + linear-gradient` on `.how-num` at line 191 — absolute ban
- **Font outside DESIGN.md** (warning): `font-family: Georgia` at line 361 — testimonial quote mark uses a third family outside the two-family Syne + JetBrains Mono system
- **30+ advisory**: Colors from the dark-blue inline system (`#060A16`, `#3B82F6`, `rgba(59,130,246,...)`) are not registered in DESIGN.md, because DESIGN.md documents the StaminaChem light palette — the two systems have never been reconciled into a single token set. Also: 14px, 18px, 24px, 3px border-radius values are outside the documented scale.

No false positives identified. The side-tab and gradient-text violations are real and clear.

---

## Overall Impression

The concept is solid: the hero copy is direct, the product mockup card is the best element on the page, and the commodity ticker is a genuinely distinctive component. But the page is functionally two design systems operating simultaneously — a dark navy inline CSS world and a StaminaChem light external CSS world — and they are incompatible. This is the single biggest issue. Every other problem is secondary to the fact that theme switching partially breaks the page and sections visually look like they belong to different products.

Biggest opportunity: reconcile the two CSS systems into one, remove the animated blobs, and let the product mockup card do the selling. The content is there; the design is getting in its own way.

---

## What's Working

**1. The hero product mockup card.** It communicates exactly what the product does — should-cost vs supplier price, gap percentage, cost driver breakdown — without a screenshot. It's domain-specific, data-dense, and reads as authentic. This is the page's single best-designed element.

**2. The commodity index ticker.** The scrolling strip of live index values (Brent Crude, Ammonia, Naphtha, etc.) is a distinctive signature component that signals "this is connected to real markets." No other procurement SaaS landing page has anything like it. It is the page's personality.

**3. Reduced motion support.** Both CSS systems implement `prefers-reduced-motion: reduce` correctly — animations are killed at the OS level, `.reveal` transitions are bypassed, the ticker stops. This is thorough and correct.

---

## Priority Issues

### [P0] The Dual Design System — Two Incompatible Visual Worlds Sharing One Page
**What**: The page has two completely separate CSS systems operating simultaneously with no reconciliation. The inline `<style>` block (lines 26–415) defines a dark navy world: `--bg:#060A16`, `--blue:#3B82F6`, body font `Syne` (sans, not mono). The external CSS files (`landing/css/*.css`) define the StaminaChem light world: `--bg:#f5f7fa`, `--accent:#00A99D`, body font `JetBrains Mono`. Sections use different class prefixes (`.hero` vs `.lp-hero`), different button shapes (`.btn` vs `.lp-btn`), and different glassmorphism rules.

**Why it matters**: Theme switching breaks the page visibly — switching to StaminaChem theme changes the external CSS sections but leaves inline CSS sections dark navy. A CPO on mobile sees a fractured page that looks unfinished. More critically: the canonical brand theme (StaminaChem light) is not the default; the page loads as dark navy because the inline CSS dominates the first section viewport. Visitors never see the documented brand identity.

**Fix**: Decide on ONE design system. Given the canonical theme is StaminaChem light, port all inline CSS sections to use `var(--bg)`, `var(--text)`, `var(--accent)` from the external token system. Remove the hardcoded `#060A16`, `#3B82F6`, `#0D1425` values from the inline CSS and replace with token references.

**Suggested command**: `/impeccable polish landing page` (after committing to one system)

---

### [P1] Animated Mesh Blobs — Explicitly Named Anti-Reference in Brand Doc
**What**: Lines 314–319. Three animated `.hero-blob` divs with `radial-gradient(circle,#3B82F6,transparent 70%)`, opacity 0.22, and continuous `blobFloat` keyframe animations (18s, 22s, 26s cycles). These are exactly "animated mesh blobs" — listed by name in DESIGN.md's Don'ts section.

**Why it matters**: This is the most prominent AI-hype signal on the page. A CPO landing here will recognize this aesthetic from 50 other SaaS tools. PRODUCT.md explicitly names this as an anti-reference. It also competes with the hero copy — the blobs animate behind the most important text on the page.

**Fix**: Remove the `.hero-mesh` and `.hero-dots` entirely, or replace with the existing engineered-grid treatment already in the external `hero.css` (lines 17–31 — the subtle `background-image` grid with radial mask). The existing grid backdrop is correct and on-brand; the blobs are not.

**Suggested command**: `/impeccable bolder landing/index.html` (to redirect the hero's visual energy more intentionally)

---

### [P1] Side-Tab Border — Absolute Ban Violation
**What**: Line 337. `.signal-tile{border-left:3px solid var(--green)}` on the market signal tiles section. This is a 3px solid left-side colored stripe — a textbook absolute-ban item.

**Why it matters**: The signal tiles are supposed to communicate market intelligence (index moves, buyer/seller signals). The left-stripe accent makes them look like a generic callout card template, undercutting the analytical authority the section is trying to project.

**Fix**: Remove `border-left`. Replace with: full-border `border:1px solid var(--green)` at lower opacity, or a leading colored category dot (per DESIGN.md's commodity category system), or directional arrow icon in the signal's own color. The border-left is the tell; the icon or full-border is the replacement.

**Suggested command**: `/impeccable polish landing/index.html`

---

### [P1] Gradient Text on Step Numbers — Absolute Ban Violation
**What**: Line 191. `.how-num{background:linear-gradient(135deg,var(--blue) 0%,var(--teal) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}`. The "How It Works" section step numbers use gradient text.

**Why it matters**: Gradient text is an absolute ban — decorative, not meaningful. It is also the number-one tell on AI landing pages. The step numbers (01, 02, 03) are structural; giving them a gradient makes them look like a 2022 Framer template, which conflicts directly with "Sharp · Trustworthy · Authoritative."

**Fix**: Replace with solid color. Use `var(--blue)` (the Intelligence Blue, `#2596be`) in StaminaChem theme, which is bold and visible against the dark section background. Or use the procurement teal `var(--accent)` if the section is on a light background. Single color, full weight — the number conveys sequence on its own.

**Suggested command**: `/impeccable polish landing/index.html`

---

### [P2] Mobile Removes the Hero's Best Element
**What**: `.hero-mockup-wrap{display:none}` below 900px viewport. The product mockup card — the page's most convincing, domain-specific element — is hidden for all mobile visitors.

**Why it matters**: Mobile is the first channel for a share link or cold email click. The CPO's assistant forwards the link; they open it on an iPhone. They see: hero text, three stats, trust pills. They do NOT see the product. The visual evidence of what CostAdvisor does — the should-cost breakdown, the gap badge, the cost driver rows — is invisible. Mobile visitors have the worst conversion experience for the most important single element.

**Fix**: Do not hide the mockup on mobile — scale it down to fit. A simplified version (single KPI row + gap badge, 280px wide) can run below the text column on a stacked layout. Or convert the mockup to a compact "signal card" that shows one key data point.

**Suggested command**: `/impeccable adapt landing/index.html`

---

### [P2] Glassmorphism Beyond the Nav — One Glass Rule Violated 4× 
**What**: Glass (`backdrop-filter: blur(...)`) is used on: `.signal-tile` (blur 12px, line 337), `.demo-viz` (blur 22px, line 368), `.legal-card` (blur 18px, line 389), `.lp-popup` (blur 26px, line 396). DESIGN.md's "One Glass Rule" states glass is used in exactly one place: the sticky nav.

**Why it matters**: Each instance of glassmorphism makes the page look more like an AI-hype template and less like a precision instrument. The "legal cards" section especially — glass cards with blur behind legal text — is exactly the "AI-hype landing page" anti-reference from PRODUCT.md.

**Fix**: Remove `backdrop-filter` from `.signal-tile`, `.demo-viz`, `.legal-card`. Replace with: flat surface background (`var(--surface)`), border, and subtle box-shadow if depth is needed. The popup (`.lp-popup`) can keep the blur as a floating utility element — that use is functional. Three of the four glass uses should become flat surfaces.

**Suggested command**: `/impeccable quieter landing/index.html`

---

## Persona Red Flags

**Jordan (Confused First-Timer — procurement manager who received a forwarded link)**

Jordan lands on the hero. The headline lands: "Know what your products should cost before your supplier tells you." Clear and direct. Then the sub-headline: "Build should-cost models from live commodity indices. Track quarterly evolution. Export AI-powered negotiation briefs."

Red flags:
- "AI-powered" in paragraph 1. Jordan's company had a bad experience with AI procurement software last year. The word lands poorly.
- "commodity indices" — Jordan buys food ingredients. They say "commodity prices" not "indices." Small but signals technical jargon.
- The animated hero blobs behind the main text create visual noise. Jordan is trying to read; the background is moving.
- The "Request Early Access" button does not explain what happens next — does Jordan fill out a form? Talk to a salesperson? How long does access take? Jordan hesitates.

**Casey (Distracted Mobile User — on phone between meetings, 45-second attention span)**

Casey taps the forwarded link. The hero loads: text, three numbers (13%, ~50%, Daily), industry pills. Scrolls down. Sees more text sections.

Red flags:
- The product mockup card — the element that would immediately show Casey what the platform does — is hidden. Casey never sees a product visualization.
- The hero stats row feels like three isolated numbers with small labels. On a 390px screen these are small. Casey can't immediately tell what these numbers mean without reading the labels.
- The theme swatches (4 dots in a pill) appear in the external CSS nav, but the active nav Casey sees is the inline CSS nav — no swatches visible. Casey can't personalize.
- The engagement popup fires after 40 seconds. Casey is probably still in the hero section. The popup covers a significant portion of a 390px screen.

**Marcus (CPO, Procurement Director — project-specific persona from PRODUCT.md)**

Marcus has 3 minutes. He skims landing pages at executive speed: headline → one-liner → proof → CTA.

Red flags:
- "AI-powered" in the hero sub — Marcus has heard this claim from 12 vendors this year. It signals undifferentiated noise, not analytical authority. PRODUCT.md explicitly warns against this.
- The animated blobs and gradient text on step numbers read as "startup trying to look impressive" — the wrong register for a tool Marcus would table in a board procurement review.
- The dual design system means Marcus might encounter visual inconsistency scrolling down the page. A tool that can't ship a consistent landing page probably can't ship a consistent product.
- The access request form asks for name + email with no mention of next steps, timing, or what "early access" means. Marcus needs to know whether this is a product trial or a demo call request.

---

## Minor Observations

- **Georgia font in testimonial** (line 361): The quotation mark uses `font-family:Georgia,serif` — a third typeface outside the two-family system (Syne + JetBrains Mono). Replace with Syne or a CSS `content:'"'` approach.
- **"AI-powered" in hero copy** (line 466): The sub-headline says "Export AI-powered negotiation briefs." PRODUCT.md's anti-references explicitly name "AI-hype landing pages." The word "AI" in the hero sub-headline contradicts the brand's documented position. Replace with: "AI-generated" → "structured" or "data-driven."
- **Hero stats are the hero-metric template** (lines 472–484): Three large numbers with small labels below. This is near the absolute-ban "hero-metric template." It's defensible here because the numbers are research-backed (McKinsey, AlixPartners) and the source is cited — but the visual treatment (large mono numerals + uppercase label) is identical to the banned pattern.
- **Identical card grids in features and security** (lines 197–233): Both sections use icon-in-square + heading + body text repeated in a grid. The features section (2-col, 4 cards) and security section (4-col, 4 tiles) both follow this pattern — the absolute-ban "identical card grids."
- **`border-radius:18px` on several components** (lines 189, 208, 238, 368) — an undocumented radius value. The design system has 4px, 8px, 12px, 16px, 20px. 18px is between xl and pill; should be resolved to one or the other.
- **The CTA cards section** uses `border-radius:20px` — documented as "pill" in the design system. This is correct. But the adjacent form uses `border-radius:10px` on inputs — not in the scale.

---

## Questions to Consider

- "What if the hero section was the only dark element — a committed dark hero section — with the rest of the page in StaminaChem light? That would resolve the dual system tension while preserving the existing dark hero aesthetic."
- "The product mockup card is hidden on mobile. What if it was the *only* hero element on mobile — remove the text column and let the product speak?"
- "The animated blobs cost visual authority. What has more credibility: a moving background, or the commodity ticker directly below the hero headline?"
- "If a CPO reads 'AI-powered' in the first paragraph, does that make them more or less likely to request access?"
