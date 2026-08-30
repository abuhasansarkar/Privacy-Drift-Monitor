# Privacy Drift Monitor — Image-Generation Prompt Pack

> Companion to `PLAN.md`. Every prompt below is derived from Part III (Information Architecture & Page Specifications) and Part XI (Design System & UX).
> Purpose: generate the complete visual design of the product with an image-generation model, consistently, screen by screen.

> **Token source of truth:** `src/app/globals.css`. Every hex value, radius and type size in
> §1 is copied from there. When you change a token in the CSS, change it here in the same
> commit — a design pack that disagrees with the code generates mockups nobody can build.
> Screen content is bound by `PLAN.md` Part III; status words are bound by the Prisma enums
> in `packages/database/prisma/schema.prisma`.

---

## 0. How to use this pack

**The formula for every screen:**

```
[STYLE BLOCK §1]  +  [SHELL FRAGMENT §2, app screens only]  +  [SCREEN PROMPT §4–§9]
```

Paste them concatenated as a single prompt. The style block is what buys you consistency across 50+ screens; never drop it, never paraphrase it.

**Working rules**

| Rule | Why |
|---|---|
| Lock a **seed** once the style block produces a look you like, and reuse that seed for every screen | Same seed + same style block = same visual family |
| Generate at **16:10 / 1440×900** for desktop, **9:19.5** for mobile, **1.91:1** for OG images, **A4 portrait 1:1.414** for PDF pages | Matches the real viewports in Part XI §11.5 |
| Generate **3–4 variants per screen**, keep one, then use it as an image reference / style reference for the next screen | Compounding consistency |
| Expect **garbled text**. Image models cannot render dense UI copy reliably | Treat output as *layout + visual language*, then rebuild real text in Figma/code |
| Keep every visible string **short** in the prompt (2–4 words) and state *"short legible labels, no paragraphs of body text"* | Fewer characters = fewer artifacts |
| Build the **Dashboard (§5.1)** first | It sets the density, chart style and card rhythm that every other app screen inherits |

**Universal negative prompt** (append to every generation, or use the model's negative field):

```
NEGATIVE: 3D render, isometric, perspective tilt, laptop or phone device mockup frame,
browser chrome, macOS window buttons, drop shadow behind the whole screen, glassmorphism,
frosted blur panels, neon glow, cyberpunk, purple-pink gradient, dark neon dashboard,
stock photography, human faces, hands, illustration mascots, 3D charts, pie charts with
bevels, skeuomorphism, heavy shadows, rounded-40px pill cards, Material Design, iOS look,
bootstrap look, watermark, logo of a real company, lorem ipsum walls of text, blurry text,
low resolution, cluttered, decorative fonts, script fonts, emoji.
```

**Model notes**

- **Nano Banana Pro / Gemini 3 Pro Image** and **GPT Image** handle UI text best — use these for screens where readable labels matter (tables, forms, settings).
- **Midjourney / Flux** give the nicest *feel* but hallucinate text — use these for the marketing pages (§4) and hero imagery.
- **Ideogram** is the strongest for logo, wordmark and OG-image text.
- For app screens, prefer an editing-capable model so you can iterate ("keep everything, change only the left sidebar").

---

## 1. MASTER STYLE BLOCK — light theme

> Paste verbatim at the top of every prompt.

```
A high-fidelity, pixel-accurate UI design mockup of a single web application screen,
presented as a flat straight-on full-bleed screenshot — no device frame, no browser
chrome, no perspective, no shadow around the canvas.

PRODUCT: "Privacy Drift Monitor" — a B2B SaaS platform used by web agencies to
continuously monitor client websites for privacy, cookie and consent-banner changes.
Serious, technical, evidence-driven, trustworthy. Never playful.

VISUAL SYSTEM: modern restrained enterprise SaaS in the spirit of Linear, Vercel and
shadcn/ui. Light theme. Page background #FFFFFF, app canvas #FAFAFA, cards #FFFFFF with
1px #E4E4E7 borders, 8px corner radius and a barely-there shadow. Muted surfaces #F4F4F5.
Text: primary #0A0A0A, secondary #71717A. ONE accent colour: blue #2563EB, used only for
primary buttons, links, active navigation and focus rings.

STATUS COLOUR, used sparingly and only inside small badges, dots, pills and charts:
success green #16A34A, warning amber #D97706, danger red #DC2626, info cyan #0891B2.
SEVERITY SCALE: critical #B91C1C, high #EA580C, medium #CA8A04, low #0284C7, info #64748B —
each severity is ALWAYS shown as a small coloured dot plus a thin line icon plus a short
text label, never colour alone.
SCORE BANDS for the health-score ring: 90-100 green #16A34A, 75-89 lime #65A30D,
50-74 amber #CA8A04, 25-49 orange #EA580C, 0-24 red #B91C1C.

TYPOGRAPHY: Inter throughout, small and tight. Page title 30px semibold, section header
24px semibold, card title 20px semibold, body 14px regular, metadata and table headers
12px medium in muted grey, and JetBrains Mono 13px for URLs, domains, cookie names and
technical values. No decorative or script fonts.

LAYOUT: strict 8px spacing grid, 24px page gutters, 16-24px gaps between cards.
Buttons 36px tall, 8px radius, blue filled for primary and white-with-border for secondary.
Inputs 36px with a 1px #E4E4E7 border. Icons are thin 1.5px-stroke monoline icons in the
Lucide style, 16px in UI chrome. Tables are dense and functional: 40px rows, 12px uppercase
muted column headers, 1px row separators, no zebra striping, right-aligned numerals.

RENDERING: crisp, sharp, high resolution, perfectly straight-on, flat vector-clean UI.
Realistic plausible English placeholder content (agency and website names, domains,
timestamps, scores). Short legible labels only, no paragraphs of body text. No people,
no photographs, no gradients except one subtle blue area-fill under a line chart.
Desktop viewport 1440x900, aspect ratio 16:10.
```

### 1b. Dark-theme variant

Replace the VISUAL SYSTEM paragraph with:

```
VISUAL SYSTEM: dark theme. App canvas #09090B, cards #18181B with 1px #27272A borders and
8px radius, muted surfaces #1F1F23. Text: primary #FAFAFA, secondary #A1A1AA. ONE accent
colour: blue #3B82F6. Status colours lifted for contrast on dark: success green #22C55E,
warning amber #F59E0B, danger red #EF4444, info cyan #06B6D4.
SEVERITY SCALE on dark: critical #F87171 on #2A1113, high #FB923C on #2A1A0D,
medium #FACC15 on #292009, low #38BDF8 on #0C2231, info #94A3B8 on #1A1F27.
SCORE BANDS on dark: 90-100 #22C55E, 75-89 #84CC16, 50-74 #EAB308, 25-49 #FB923C,
0-24 #EF4444.
Deep, calm, low-glare — absolutely no neon glow and no colour bleed.
```

> The dark severity and score values above are the `.dark` block in
> `src/app/globals.css`. They were previously missing here, so dark-theme screens were being
> generated with the light-theme severity hues, which fail contrast on #09090B.

---

## 2. SHELL FRAGMENT — the authenticated app chrome

> Paste after the style block for **every** `/app/*` screen (§5, §6). It guarantees the sidebar and header are identical everywhere.

```
APP SHELL: a fixed 240px left sidebar on #FAFAFA with a 1px right border. At its top, a
small blue shield-and-pulse logo mark beside the wordmark "Privacy Drift Monitor" in 15px
semibold. Below it a vertical nav of 16px monoline icons with 14px labels, in this order
and grouped by thin separators:
  Dashboard · Websites · Clients · Issues (with a red "12" count badge)
  ─────
  Trackers · Privacy Drift · Scans · Reports
  ─────
  Alerts · Notifications (blue "3" badge) · AI Assistant
  ─────
  Team · Billing · Settings · Help
The active item has a subtle #F4F4F5 pill background, a blue left indicator bar and blue
icon. At the bottom of the sidebar, a collapse chevron.

TOP HEADER: 56px tall, white, 1px bottom border. Left: breadcrumb trail in 13px muted text.
Centre-right: a 320px search input with a magnifier icon, placeholder "Search…" and a small
grey "⌘K" keycap chip on its right edge. Right side, evenly spaced: a small "2 scans
running" pill with a spinning indicator, a bell icon with a blue dot, and a 28px circular
avatar with initials.

The main content area sits to the right of the sidebar and below the header on the
#FAFAFA canvas with 24px padding.
```

---

## 3. COMPONENT LEXICON

Reusable phrases — drop these into any screen prompt instead of re-describing a component.

| Component | Prompt phrase |
|---|---|
| **Score ring** | `a 64px circular progress ring showing "82" in the centre in 24px semibold with the word "Health" beneath in 11px muted caps, the ring stroke 6px, coloured by score band, remaining track in #E4E4E7` |
| **Severity badge** | `a small 22px pill badge with a coloured dot, a thin icon and a short label — "Critical" on #FEF2F2 with #B91C1C text, "High" on #FFF7ED, "Medium" on #FEFCE8, "Low" on #F0F9FF` |
| **Stat tile** | `a white card, 12px uppercase muted label at top, a 30px semibold figure below, and a small green or red trend chevron with a percentage beside it` |
| **Consent phase matrix** | `a four-row result matrix, one row per consent journey — "No consent", "Reject All", "Accept All", "Withdraw" — each row with the action taken, a result summary, and an outcome cell that is ALWAYS an icon PLUS a word: a filled red dot with "Detected", a hollow grey ring with "Not detected", a grey dash with "Could not be determined". Never a green tick or a red cross.` |
| **Drift diff card** | `a card with a date and site name, a coloured change-type badge, a one-line human summary, and a two-column before/after mini-table where added rows have a green "+" and a #F0FDF4 tint and removed rows a red "−" and a #FEF2F2 tint` |
| **Evidence row** | `a dense monospace table row: time offset "1842ms", method "GET", a truncated URL in JetBrains Mono, resource type, status 200, size, a "3rd party" chip and a red "Before consent" chip` |
| **Tracker chip** | `a small rounded chip with a 16px square vendor favicon placeholder, the vendor name, and a category badge such as "Marketing", "Analytics" or "Essential"` |
| **AI output card** | `a card with a faint blue left border, a small sparkle icon, a persistent 11px muted label "AI-generated from the evidence above", 2–3 short paragraphs, a confidence pill, inline blue evidence links, and thumbs-up / thumbs-down icons in the footer` |
| **Empty state** | `a centred empty state: a 48px thin monoline illustration icon in muted grey, a 16px semibold headline, a 14px muted single-sentence explanation, and one blue primary button beside one outline button` |
| **Skeleton loading** | `grey #F4F4F5 rounded skeleton placeholder bars matching the exact shape of the real content, no spinner` |
| **Partial-scan notice** | `an amber inline alert bar with a triangle icon on #FFFBEB with a #D97706 left border and short warning text` |
| **Usage meter** | `a labelled horizontal progress bar, 6px tall, rounded, blue fill, with "18 of 25" in 13px on the right` |

---

## 4. MARKETING SITE (public)

Use Midjourney/Flux here; text accuracy matters less, feel matters more. Aspect **16:10** for full pages, or **2:3 tall** if your model supports long-page composition.

### 4.1 `/` Homepage — hero
```
A marketing website hero section for "Privacy Drift Monitor". Sticky transparent header:
logo left; centre nav "Features · How It Works · Pricing · Resources"; right "Free Scanner"
ghost button, "Login" text link and a blue "Start Free Trial" button. Below, a two-column
hero: LEFT — a 48px semibold headline "Detect privacy and consent changes across every
client website", a 16px muted two-line subheading, a URL input with placeholder
"yourclientsite.com" and an attached blue "Scan free" button, and beneath it a small row of
grey trust text. RIGHT — a floating, slightly-cropped screenshot of the product dashboard
with a small white notification card overlapping its corner reading "3 trackers added"
with a red drift badge. Lots of white space, one subtle blue radial glow behind the
screenshot, thin grid pattern at 4% opacity in the background.
```

### 4.2 `/` Homepage — Privacy Drift differentiator section
```
A marketing website section on white. Centred 12px blue uppercase eyebrow "PRIVACY DRIFT",
a 36px semibold headline "A snapshot tells you today. Drift tells you what changed.", and a
muted one-line subheading. Below, a wide white card with a 1px border containing a
before/after diff: left column "Last week" and right column "Today", with three change rows —
a green "+3 trackers" row, a green "+5 third-party domains" row and a red "Reject All
regression" row, each with a thin icon and a short technical detail line in JetBrains Mono.
A faint vertical divider between the columns and a small timestamp footer.
```

### 4.3 `/` Homepage — full page composition
```
A complete long-scroll SaaS marketing homepage laid out top to bottom as one tall image:
(1) hero with headline, dual CTA and dashboard screenshot; (2) a three-card problem row;
(3) a four-step horizontal stepper "Add sites → Scan in a real browser → Compare with last
time → Get told what changed"; (4) a three-column benefits row with thin icons; (5) a
side-by-side "static scanner sees / we see" comparison visual; (6) a drift diff card
section; (7) an AI explanation screenshot card; (8) an 80-site portfolio grid mock with
three tiles highlighted red; (9) a branded PDF report mockup; (10) four compact pricing
cards with the middle one elevated and outlined blue; (11) a six-item FAQ accordion;
(12) a final centred CTA band on a very light blue tinted background. Consistent 1200px
content width, generous vertical rhythm, alternating white and #FAFAFA section backgrounds.
Aspect ratio 9:32, very tall.
```

### 4.4 `/features`
```
A features overview page. A sticky secondary sub-navigation bar of 12 short anchor chips
beneath the main header, with the first chip active in blue. Below, alternating
left-image/right-text feature blocks — each with a 40px thin monoline icon in a rounded
#F4F4F5 tile, a 24px semibold headline, two lines of muted body text, a small blue "Learn
more →" link, and a bordered screenshot or simple line diagram on the other side. Show four
blocks: "Runtime browser scans", "Consent testing", "Tracker detection", "Privacy Drift".
```

### 4.5 `/how-it-works`
```
A vertical scrollytelling explainer page. A centre vertical timeline rail with eight
numbered blue circular nodes. Each stage is a card offset alternately left and right,
containing a short stage title, two lines of muted text, and a clean flat schematic diagram
of thin boxes and arrows. Stages: Add Websites, Scan, Test Consent, Detect Trackers,
Compare Changes, Alert, Explain, Report. Near the bottom, a bordered honesty panel titled
"What we can and can't see" with two short bulleted columns and a neutral grey icon.
```

### 4.6 `/pricing`
```
A SaaS pricing page. Centred 36px headline, a muted subheading, a monthly/annual segmented
toggle pill with "Annual — 2 months free" in a small green chip beside it, and a small
USD/GBP/EUR currency selector. Below, four plan cards in a row — Starter, Growth,
Professional, Agency — each with plan name, a 36px price with "/mo" suffix, a one-line
description, a full-width button, a thin separator and a list of six feature rows with small
blue check icons. The third card is elevated with a blue 1px border, a slight lift, and a
blue "Most popular" ribbon chip at the top. Beneath the cards, the top rows of a
feature-comparison table with a sticky first column.
```

### 4.7 `/free-scanner` — input state
```
A single-purpose public scanner page. Centred, generous white space. A 36px semibold
headline "Scan any website for free", a muted one-line subheading, then a large 52px URL
input with a globe icon and an attached blue "Scan website" button. Beneath, a small
Cloudflare Turnstile verification widget, and a row of three short muted reassurance items
with tiny icons: "No signup", "Results in ~60 seconds", "We don't install anything".
Below the fold edge, a faint locked preview of what a full result looks like.
```

### 4.8 `/free-scanner` — running state
```
The same public scanner page mid-scan. The URL is now shown as a static monospace chip.
Centre stage: a vertical live progress checklist of eight stages, each a row with a status
glyph on the left — completed rows have a green check and a small grey duration like "2s"
plus a short found-result note in muted text such as "Complianz detected"; the current row
has a spinning blue indicator; upcoming rows have hollow grey circles and greyed labels.
Stages: Preparing browser, Loading page, Detecting consent banner, Testing no consent,
Testing Reject All, Testing Accept All, Testing withdrawal, Analysing trackers.
```

### 4.9 `/free-scanner/[token]` — gated result
```
A public scan result page. Top: the scanned domain in JetBrains Mono, a timestamp, and a
large 120px circular health score ring reading "64" in amber with the word "Fair" beneath.
A row of four stat tiles: "Consent banner — Detected (Complianz)", "Trackers before consent
— 3", "Cookies before consent — 7", "Third-party domains — 11". Below, three expandable
finding cards, each with a severity badge, a short title and one line of detail. Beneath
them, a blurred and locked panel behind a frosted overlay with a small padlock icon listing
five greyed items — Reject All testing, Withdrawal testing, Drift detection, Alerts,
Reports — and a centred blue "Monitor this website — start free trial" button on top.
```

### 4.10 `/login` and `/signup`
```
A split-screen authentication page. LEFT half, white, centred 400px column: the logo mark,
a 24px semibold "Welcome back", an email input, a password input with a show/hide eye icon,
a small "Forgot password?" blue link, a full-width blue "Sign in" button, a "or" divider,
and an outlined "Continue with Google" button with a Google glyph. Small muted footer link
"Don't have an account? Sign up". RIGHT half, a very light blue-grey panel containing a
tilt-free cropped product screenshot and a short 20px testimonial-style quote with a small
avatar circle beneath it.
```

### 4.11 Legal / blog article template
```
A long-form document page. A narrow 720px centred prose column with a 30px semibold title,
a muted "Last updated 14 March 2026" line, and clean typographic body text with clear h2
headings and short paragraphs. On the left, a sticky table-of-contents rail of small muted
links with the active one in blue. Very generous line height, no images, no cards.
```

---

## 5. AUTHENTICATED APP — core surfaces

> Every prompt in this section needs **STYLE BLOCK §1 + SHELL FRAGMENT §2** in front of it.

### 5.1 `/app` — Dashboard ★ generate this first
```
SCREEN: the main Dashboard. Breadcrumb "Dashboard". Page title "Good morning, Priya" in
30px semibold with a muted subtitle "47 websites monitored", and a blue "Add Website"
button top right.

Row 1 — a strip of seven compact stat tiles across the full width: "Websites Monitored 47",
"Healthy 39", "Warnings 5", "Critical 3", "Scans Today 22", "New Issues (24h) 6",
"Drift Events (7d) 11". Each tile has a 12px uppercase muted label, a 30px semibold figure
and a small coloured trend chevron.

Row 2 — a two-thirds / one-third split.
LEFT, a card titled "Attention Center" with a small "5 items" count: five dense list rows,
each with a coloured severity dot and icon, a bold website domain, a one-line description
("Meta Pixel firing before consent", "Reject All stopped blocking analytics", "3 consecutive
scan failures"), a muted relative timestamp on the right, and three small ghost action
buttons "View · Acknowledge · Re-scan" appearing at the row end.
RIGHT, stacked: a card "Privacy Drift — last 7 days" containing four short summary lines
each with a coloured count chip, and beneath it a compact "Recent Activity" card with five
timeline rows of tiny icons and muted text.

Row 3 — a wide card "Privacy Health Trend" containing a smooth line chart over 30 days,
blue 2px stroke with a very subtle blue area fill, a light dotted horizontal gridline set,
small 11px axis labels, and three small diamond annotation markers on the line.

Row 4 — a card "Websites Needing Attention" with a dense five-row table: favicon + domain,
client name, a coloured score pill, split severity issue badges, and a relative last-scan
time.
```

### 5.2 `/app/websites` — list, table view
```
SCREEN: the Websites list. Page title "Websites" with a muted "47 sites" count, and top
right a blue "Add Website" button plus outline "Import CSV" and an overflow "⋯" button.
Below the title a filter bar: a search input, four dropdown filter chips (Client, Group,
Status, Health), a "More filters" ghost button, and on the far right a two-icon segmented
table/grid view toggle with table active.

Main: a dense data table with a checkbox column, then columns "Website" (16px favicon
square + domain in 14px medium with the site name in 12px muted beneath), "Client",
"Status" (green "Active" / grey "Paused" / red "Error" pill), "Health Score" (a coloured
numeric pill), "Open Issues" (small severity-split badges like a red 2 and an amber 3),
"Trackers" (right-aligned count), "Last Scan" (relative time plus a tiny status icon),
"Next Scan", and a trailing "⋯" row-action button. Twelve rows of realistic agency data.
Footer: a row-count line on the left and cursor pagination buttons on the right.
```

### 5.3 `/app/websites` — grid view
```
SCREEN: the Websites list in grid mode, view toggle set to grid. A responsive four-column
grid of website cards. Each card: a 16:9 muted screenshot thumbnail of a generic webpage at
the top with rounded top corners, then a favicon and domain, a client name in 12px muted, a
48px score ring on the right, and a footer row with small severity badges and a relative
"Scanned 3h ago" label with a tiny check icon. One card shows a red-tinted border and a
"Scan failed" state instead of a thumbnail.
```

### 5.4 Add Website wizard (modal)
```
SCREEN: the Websites list dimmed behind a 40% black scrim, with a centred 640px modal
dialog, 12px radius, white, strong but soft shadow. Modal header: "Add Website" in 20px
semibold, a muted "Step 1 of 4" and an X close button. Beneath the header a four-segment
progress bar with the first segment blue. Body: a label "Website URL", a large input
containing "https://" as a muted prefix and typed text "acmedental.co.uk", and beneath it a
live validation status stack of three small rows — a green check "DNS resolved", a green
check "Reachable — 200 OK", and a spinning blue indicator "Checking redirects…". Below
that, a light amber inline alert with a triangle icon reading "This site is protected by a
bot challenge. Some scans may be incomplete." Footer: a ghost "Cancel" button left, a blue
"Continue" button right.
```

### 5.5 `/app/websites/import` — CSV import
```
SCREEN: the CSV import page. Page title "Import Websites". A large dashed-border drop zone
with a thin upload-cloud icon, "Drag a CSV here or browse", and a small blue "Download
template" link. Below it, an import preview card: a table with columns "URL", "Client",
"Group", "Frequency" and a right-hand "Status" column showing green "Ready" chips on most
rows, one amber "Client will be created" chip and one red "Duplicate — skipped" chip.
Above the table, three small summary counters: "38 ready", "2 warnings", "1 error".
Footer: an outline "Back" and a blue "Import 38 websites" button.
```

### 5.6 `/app/websites/[id]` — Website Detail, **Overview** tab
```
SCREEN: a website detail page. Header block: a 24px favicon, the domain "acmedental.co.uk"
in 30px semibold with a small external-link icon, a client chip "Acme Dental", a green
"Active" pill, and on the right an 80px score ring reading "78" with a small green "+4"
delta chip. A sub-header strip of muted 13px metadata separated by dots: "Last scan 3h ago ·
124s · Completed", "Next scan in 21h", "CMP: Complianz", "Weekly". Top-right actions: blue
"Scan now", outline "Generate report", ghost "Pause" and "⋯".

Below, a horizontal tab bar with eleven tabs — Overview, Issues, Trackers, Cookies, Consent,
Changes, Scans, Evidence, Reports, AI, Settings — with Overview active (blue underline).

Content, a two-column grid of cards: "Score breakdown" with five weighted component rows
each showing a mini horizontal bar and a point contribution; "Open issues by severity" with
four counter rows; "Trackers by category" with a donut chart and a small legend;
"Consent test results" as a four-row phase matrix (see the Consent phase matrix lexicon
entry — outcome icon plus word, never a tick or a cross);
"30-day score" as a wide sparkline; "Latest banner screenshot" as a bordered thumbnail of a
generic cookie banner; and "What changed since last scan" as a small green/red diff list.
```

### 5.7 Website Detail — **Trackers** tab
```
SCREEN: the same website detail page with the Trackers tab active. Filter chips above the
table: Category, Consent state, "New since last scan" toggle. A dense table with columns
"Vendor" (16px logo placeholder square + vendor name), "Category" (coloured badge —
Marketing, Analytics, Essential, Social), "Risk" (High/Medium/Low pill), "First seen under"
(a chip, red "Before consent" on several rows and grey "After Accept" on others), "Requests"
count, "First detected", "Last seen", and "Confidence" as a small percentage. Twelve rows
including Google Analytics, Meta Pixel, Hotjar, TikTok Pixel, LinkedIn Insight. One row is
expanded, revealing an indented sub-panel of two monospace request lines and one cookie row.
At the bottom, a muted collapsed group header "Unknown vendors (4)" with a small "Suggest
classification" ghost button.
```

### 5.8 Website Detail — **Cookies** tab
```
SCREEN: the Cookies tab. Above the table, a four-segment comparison toggle bar:
"Before consent (7) · After Reject (7) · After Accept (34) · After Withdraw (12)", with
"Before consent" active. A dense table with columns "Name" (JetBrains Mono), "Domain"
(mono, muted), "Party" (a "1st" or "3rd" chip), "Category" badge, "Expiry", and three narrow
boolean columns "Secure", "HttpOnly", "SameSite" rendered as small check or cross icons,
then "Set under" as a consent-state chip. Three rows are highlighted with a faint red-tinted
background and a small red flag icon in the leftmost gutter, indicating non-essential
cookies present after Reject All.
```

### 5.9 Website Detail — **Consent** tab ★ signature screen
```
SCREEN: the Consent tab — the CMP report card. Top: a card with a shield icon, "Complianz"
in 20px semibold, a version chip "v7.2", and a "Detection confidence 96%" pill.
Below, four large phase result cards stacked vertically, each split into three columns:
LEFT a phase name and number ("1. No consent", "2. Reject All", "3. Accept All",
"4. Withdraw"); MIDDLE a short "What we did" description in muted text; RIGHT a result line
with a bold count, an outcome icon and an outcome WORD — a filled red dot + "Detected" for
"3 marketing trackers fired", a filled red dot + "Detected" for "1 marketing tracker still
firing", a hollow grey ring + "Expected" for "14 trackers fired after Accept All", and a
grey dash + "Could not be determined" for "preferences link not found".
No ticks, no crosses, no pass/fail badges anywhere on this screen (§11.1).
Each card has a faint left border in its outcome colour and a small blue "View evidence →"
link. To the right of the stack, a vertical strip of four bordered banner screenshot
thumbnails, one per phase, each labelled.
```

### 5.10 Website Detail — **Changes / Privacy Drift** tab
```
SCREEN: the Changes tab. A top bar with a date-range picker, change-type and severity filter
chips, and on the right a "Compare any two scans" selector with two small dropdowns and a
"Compare" button. Below, a vertical timeline of drift event cards grouped under sticky day
headers ("14 March 2026"). Each card: a coloured change-type badge ("Tracker added",
"Consent regression", "Cookie changed"), a bold one-line summary "Meta Pixel added", a muted
scan link, and a two-column before/after mini-table with green "+" added rows tinted
#F0FDF4 and red "−" removed rows tinted #FEF2F2. One card additionally contains a nested
AI narrative block with a sparkle icon and two short sentences.
```

### 5.11 Website Detail — **Evidence** tab
```
SCREEN: the Evidence tab — a dense technical inspector, deliberately the busiest screen in
the product. A scan selector dropdown top-left and an outline "Export" button top-right.
A five-tab inner bar: Requests, Cookies, Storage, Console, Screenshots — Requests active.
A horizontal filter row: a domain search input, and dropdowns for Consent phase, Resource
type, plus two toggle chips "Third-party only" and "Tracker-matched only".
Main: a virtualised monospace table with a thin scrollbar and columns "Time" (right-aligned
"1842ms"), "Method", "URL" (long truncated JetBrains Mono URLs), "Type" (script, xhr, image
chips), "Status", "Size", "Party" and "Phase" (a red "Before consent" chip on several rows),
and "Tracker" (a small vendor chip where matched). Around 20 rows, tight 32px row height.
One row is expanded into a nested detail panel showing an initiator chain as an indented
tree, a small redacted headers list, and timing bars.
```

### 5.12 `/app/issues` — cross-portfolio issue queue
```
SCREEN: the Issues queue. Page title "Issues" with a muted "38 unresolved". Above the table, a row
of saved-view pills — "All", "My critical issues", "New this week", "Unassigned", "Consent
regressions" — with the second one active, plus a "Save view" ghost button. Beneath, a
filter bar of six dropdown chips. A selection-aware toolbar is visible in a blue-tinted strip
reading "4 selected" with ghost buttons "Acknowledge · Assign · Ignore · Resolve".
The table: checkbox, "Severity" (badge with dot and icon), "Issue" (title in 14px medium
with a monospace rule ID like "PDM-R014" in 12px muted beneath), "Website", "Client",
"Status" (New / Acknowledged / Resolved pill — the first state is "New", matching the
`IssueStatus` enum; there is no "Open"), "Assignee" (24px avatar), "First detected",
"Last seen", "Age". Fourteen dense rows, four with checked checkboxes and a faint blue row
tint.
```

### 5.13 `/app/issues/[id]` — issue detail ★ signature screen
```
SCREEN: an issue detail page, single 900px content column with a sticky right rail.
HEADER: a red "Critical" severity badge, a 30px semibold title "Meta Pixel observed before
consent", a monospace rule ID chip, the website domain as a blue link, and on the right a
"Status: New" dropdown, an assignee avatar picker, and buttons "Acknowledge", "Resolve" and
a "⋯" menu.
Then a strictly ordered stack of bordered sections, each with a 12px uppercase muted section
label:
 1 "WHAT HAPPENED" — one bold plain sentence.
 2 "WHY THIS MATTERS TECHNICALLY" — three lines of neutral muted body text.
 3 "EVIDENCE" — a bordered panel with two monospace request rows, one cookie row, a small
   red "consent_state = not_given" chip, a timestamp offset, and a 160px bordered screenshot
   thumbnail on the right, plus a blue "Open full evidence →" link.
 4 "WHEN DETECTED" — first seen / last seen / occurrence count as three inline metrics with
   a small sparkline beside them.
 5 "AI EXPLANATION" — a card with a faint blue left border, a sparkle icon, two short
   paragraphs, a "Confidence: High" pill, three inline blue evidence links, a persistent
   11px muted label "AI-generated from the evidence above", and thumbs up/down icons.
 6 "RECOMMENDED ACTION" — a numbered three-step list, an "Affected system: GTM" chip and a
   "Risk of fix: Low" chip.
 7 "DEVELOPER TASK" — a monospace block on #F4F4F5 with a copy icon top right.
 8 "ACTIVITY" — a vertical timeline of four small avatar + text + timestamp rows.
```

### 5.14 `/app/drift` — Privacy Drift feed ★ signature screen
```
SCREEN: the portfolio-wide Privacy Drift feed. Page title "Privacy Drift" with a muted
"23 events in the last 7 days". A filter bar with change-type, severity, website, client and
date-range chips. Main content is a monitoring timeline, not a table: sticky day headers
("Today", "Yesterday", "12 March 2026") each with a small grey rollup line "4 websites
changed · 6 events". Under each header, a vertical rail with small coloured nodes connecting
event cards. Each card: a favicon and domain, a change-type badge, a bold one-line summary,
a before → after inline diff with a right arrow between two small monospace values, and a
footer row of muted links "View scan · View issue". Two cards carry a small AI narrative
strip. The feel is calm, chronological and scannable.
```

### 5.15 `/app/scans/[id]` — scan detail
```
SCREEN: a scan detail page. Header: website domain, a green "Completed" status pill, the
start timestamp, a "124s" duration chip and a "Scheduled" trigger chip, with an outline
"Re-run scan" button on the right.
Section 1 — a metadata card laid out as a four-column definition grid of 12px muted labels
over 13px monospace values: scan ID with a copy icon, scanner version, Chromium build,
viewport, worker ID, region, queue wait, total duration.
Section 2 — a horizontal phase timeline: four labelled duration bars in a row (No consent,
Reject All, Accept All, Withdraw) with proportional widths, small durations inside each bar,
and a status icon above each.
Section 3 — a row of six result stat tiles: trackers, cookies, third-party domains,
requests, storage keys, issues created.
Section 4 — a four-row consent test matrix.
Section 5 — the top of a dense virtualised request table.
```

### 5.16 Scan progress panel (live state)
```
SCREEN: a website detail page immediately after a scan is triggered, showing the live scan
progress panel as the dominant element — a wide white card titled "Scanning acmedental.co.uk"
with a thin indeterminate blue bar at the top edge. Inside, a vertical checklist of ten
stages. Completed stages have a green check, the stage name, a small grey duration and a
short muted result note in italic-weight text such as "Complianz detected" or "3 trackers
observed". The current stage has a spinning blue arc and an elapsed counter. Remaining
stages have hollow grey circles and 40%-opacity labels. Stages: Preparing browser, Loading
page, Detecting consent banner, Testing no consent, Testing Reject All, Testing Accept All,
Testing withdrawal, Analysing trackers, Comparing with previous scan, Generating results.
Beside the panel, a smaller card inviting the user to "Add another website while this runs"
with a compact URL input.
```

### 5.17 `/app/clients` and client detail
```
SCREEN A — Clients list. Page title "Clients", blue "Add Client" button. A table with
columns "Client" (a 28px circular initials avatar in a muted tint plus the name), "Websites"
count, "Health" (a coloured average score pill), "Open Issues" severity badges, "Portal
Access" (a green "Enabled" or grey "Disabled" pill), "Last Report" date, and a "⋯" action.
Ten rows.

SCREEN B — Client detail. Header with a 40px initials avatar, client name in 30px semibold,
a "4 websites" chip and a green "Portal enabled" pill; buttons "Generate report" and "⋯".
A six-tab bar — Overview, Websites, Issues, Reports, Portal, Settings — Overview active.
Content: three stat tiles (Average health, Open issues, Next report), a compact website table
and a small recent-activity list.
```

### 5.18 `/app/trackers` — portfolio vendor inventory
```
SCREEN: the portfolio tracker inventory. Page title "Trackers". A wide card at the top
titled "Portfolio vendor exposure" containing a horizontal stacked bar chart broken into
category segments with a small legend beneath. Below, a table with columns "Vendor" (logo
square + name), "Category" badge, "Risk" pill, "Websites affected" (a count rendered as a
blue link with a tiny mini-bar beside it showing proportion of the portfolio), "Total
detections", "First seen", and "Trend" (a 60px sparkline with a small up or down chevron).
Filter chips above: Category, Risk, "New this period", "Unknown only".
```

### 5.19 `/app/reports` — library and generation wizard
```
SCREEN A — Report library. Page title "Reports", blue "Generate report" button. Table:
"Report" (name plus a small type icon), "Type" badge, "Scope" (agency / client / website
chip), "Period", "Generated", "Generated by" (avatar + name), "Status" (a green "Ready",
blue animated "Generating", grey "Queued" or red "Failed" pill), "Size", and row actions
"Download · ⋯". Ten rows.

SCREEN B — Generate report wizard, a 720px modal. A left vertical step rail with four steps.
Right pane, step 3: a "Type" segmented card selector of five options each with an icon, a
scope dropdown, a date-range picker, and four checkbox option rows ("Include evidence
appendix", "Include AI summary", "Include resolved issues", "Include screenshots").
Beneath, a small live branding preview thumbnail of the report cover.
```

### 5.20 `/app/reports/[id]` — report detail
```
SCREEN: a report detail page. Left two-thirds: an embedded PDF preview inside a bordered
frame with a light grey page background, showing a branded report cover page — an agency
logo placeholder top left, a large title "Monthly Privacy Monitoring Report", a client name,
a period line, a large score ring and a small footer disclaimer line in 8px grey.
Right one-third: a metadata card with definition rows, a blue "Download PDF" button, outline
"Regenerate" and "Share link" buttons, and a small "Shared links (1)" list with an expiry
timestamp and a revoke icon.
```

### 5.21 `/app/alerts`
```
SCREEN: the Alerts page with two tabs, "Rules" active. A blue "Create rule" button.
A table: "Rule" (name plus a muted condition line beneath), "Scope" (chip: All sites /
Group / Client / Single site), "Channels" (small email and bell icons), "Schedule"
(Immediate / Daily digest / Weekly digest chip), "Threshold" (a severity badge), "Quiet
hours" (a small "22:00–07:00" mono chip), and a right-aligned toggle switch, three on and
one off. Six rows.
```

### 5.22 `/app/notifications`
```
SCREEN: the notification centre. Two tabs "Unread (3)" and "All", with a "Mark all read"
ghost button on the right and a type filter dropdown. A vertical list of notification rows:
each has a 32px circular tinted icon badge on the left (red for critical issue, blue for
scan completed, green for issue resolved, purple-free amber for report ready), a bold
one-line title, a muted second line, and a relative timestamp on the right. Unread rows have
a faint blue tint and a 6px blue dot at the far left. Twelve rows.
```

### 5.23 `/app/ai` — AI assistant panel
```
SCREEN: the AI Assistant page — a task panel, not a chat. Page title "AI Assistant" with a
sparkle icon, and top right a credit meter card showing "1,240 of 2,000 credits" with a thin
blue progress bar. A 2×2 grid of four large action cards: "Explain an issue", "Summarise
this week's drift", "Draft a client message", "Summarise a website's status" — each with a
40px thin monoline icon in a rounded tinted tile, a 20px semibold title, two lines of muted
description, and a small outline "Run" button. Below the grid, a "Recent outputs" list of
three rows with a model chip, a token cost, a timestamp and a "View" link.
```

### 5.24 `/app/team`
```
SCREEN: the Team page. Page title "Team" with a muted "6 of 10 seats used" and a blue
"Invite member" button. A members table: 32px avatar + name + email, "Role" (a dropdown-style
pill: Owner, Admin, Manager, Developer, Viewer), "Status" (green "Active" / amber "Invited"),
"Last active", "Joined", and a "⋯" action. Six rows. Below, a "Pending invitations" card with
two rows each showing an email, a role chip, an expiry line and small "Resend" and "Revoke"
ghost buttons. At the bottom, a collapsed "Role permissions" reference card.
```

### 5.25 `/app/billing`
```
SCREEN: the Billing page, two-column. LEFT: a current-plan card with the plan name
"Professional" in 24px semibold, "$149/month", a green "Active" pill, a renewal date line,
and buttons "Change plan" (blue) and "Manage billing" (outline). Beneath it, a "Usage this
period" card with five labelled progress meters — Websites 18/25, Scans 340/500, AI credits
1,240/2,000, Team seats 6/10, Storage 12/50 GB — one of them amber and near-full with a
small "Approaching limit" chip. RIGHT: a payment-method card showing a card brand glyph and
"•••• 4242", a billing-email row and a VAT ID row; below it an invoice history table with
date, amount, status pill and a download icon per row. A slim amber trial banner spans the
top: "9 days left in your trial".
```

### 5.26 `/app/settings/branding` — white-label
```
SCREEN: the Branding settings page. A left settings sub-navigation rail of seven items
(General, Branding, Notifications, Scanning, AI, Security, Integrations) with Branding
active. Main area, two columns. LEFT, a form card: two logo upload tiles side by side
labelled "Logo (light)" and "Logo (dark)" each a dashed drop zone with a small placeholder
mark; two colour fields each with a colour swatch button, a hex input in JetBrains Mono and
a small green "AA contrast passes" chip; then inputs for company name, report footer text,
custom disclaimer textarea, contact email, and a read-only portal link field showing
"/portal/acme-dental" in JetBrains Mono with a small copy icon. RIGHT, a sticky "Live
preview" card showing two stacked mini mockups: a branded report cover and a branded portal
header.
```

> This field used to read "portal subdomain … `.portal.driftmonitor.app`". PLAN.md §12.9 Q2
> decided **no custom domains for v1** — the portal is path-based at `/portal`. Designing a
> subdomain field would have shipped a control the product cannot honour.

### 5.27 `/app/settings/general` — generic settings template
```
SCREEN: a settings page using the standard settings template. The left settings sub-nav
rail with "General" active. Main area: a stack of bordered form cards, each with a 20px
semibold card title, a muted one-line description, then labelled fields in a two-column
grid — text inputs, dropdowns, and toggle-switch rows with a label and helper text on the
left and the switch on the right. A sticky bottom action bar with a ghost "Discard" and a
blue "Save changes" button, faintly separated by a top border.
```

### 5.28 `/app/onboarding`
```
SCREEN: the onboarding wizard as one calm scrolling page, no sidebar. A slim top bar with
just the logo and a thin blue progress line at 40%. Centred 640px column. A 30px semibold
"Let's get your first website monitored", then a vertical stack of completed and current
steps: two collapsed completed steps shown as single rows with a green check, the label and
the chosen value in muted text; then the active step expanded in a bordered card —
"Your first website" with a large URL input showing live green validation checks beneath it;
then two greyed-out upcoming step rows. A blue "Continue" button at the bottom of the active
card and a small muted "Skip for now" link beside it.
```

### 5.29 Empty state (portfolio zero-state)
```
SCREEN: the Websites page in its zero state. The full app shell is present but the content
area holds a single centred empty state within a large dashed-border region: a 56px thin
monoline globe-with-shield icon in muted grey, an 18px semibold headline "No websites yet",
a 14px muted single sentence "Add your first client website to start monitoring privacy
behaviour.", a blue "Add Website" button beside an outline "Import CSV" button, and beneath
them a small muted link "or try the free scanner".
```

### 5.30 Error / partial-scan state
```
SCREEN: a website detail Overview tab where the latest scan is PARTIAL. Directly beneath the
sub-header, a prominent amber alert panel with a triangle icon on #FFFBEB with a 3px #D97706
left border: a bold line "Some consent tests couldn't be completed on this scan", a muted
second line, a small bulleted list of two skipped phases each with a monospace error code,
and a "See what was skipped" outline button. The consent matrix card below shows two rows
with grey dash icons and the label "Could not be determined" instead of a pass or fail.
```

---

## 6. ADMIN PANEL (`/admin`)

Same style block; swap the sidebar in the SHELL FRAGMENT for: `a 240px dark #18181B sidebar with white text, a small "ADMIN" red chip beside the wordmark, and nav items Dashboard · Agencies · Users · Websites · Scans · Queue · Issues · Trackers · AI Usage · Billing · System Health · Logs · Feature Flags · Settings`.

### 6.1 `/admin` — ops dashboard
```
SCREEN: an internal operations dashboard, denser and more utilitarian than the customer app.
A top grid of ten small metric tiles: Total agencies, Active websites, Scans today
(with a green/amber/red split micro-bar), Failed scan rate, Critical issues today, AI spend
today, AI spend MTD, MRR, Error rate, p95 API latency. Below, a two-column row: a "Queue
depth" card with five horizontal bars labelled scan, analysis, report, ai, notification,
each showing waiting/active counts; and a "Worker health" card listing six worker rows with a
green or red heartbeat dot, a hostname in monospace, uptime and jobs-processed count.
Bottom: a wide "Error rate — last 24h" area chart in red on white.
```

### 6.2 `/admin/queue` — live BullMQ board
```
SCREEN: a live queue operations board. Five columns as vertical lanes labelled Waiting,
Active, Completed, Failed, Delayed, each with a count chip in its header and a coloured top
border. Each lane holds compact job cards: a monospace job ID, a website domain, an attempt
counter chip like "2/3", and a relative timestamp; failed cards are red-tinted with a small
error-code chip. Above the lanes, a toolbar with queue-selector tabs and destructive-looking
outline buttons "Retry all failed", "Pause queue", "Drain". On the right, a slide-in job
inspector panel showing a JSON payload in JetBrains Mono on a muted background and a
collapsed stack trace.
```

### 6.3 `/admin/trackers` — vendor database
```
SCREEN: the tracker vendor database admin. Two panes. LEFT (two-thirds): a CRUD table of
vendors with columns Name, Category, Risk, Domain patterns (monospace, truncated), Cookie
patterns, Confidence, and edit/delete icon buttons; above it a search input and "Add vendor"
and "Import JSON" buttons. RIGHT (one-third): an "Unknown domain queue" card — a ranked list
of observed unmatched domains in JetBrains Mono, each with a frequency count, a
"seen across 14 agencies" muted line, and a small blue "Create vendor" button.
```

### 6.4 `/admin/ai-usage` and `/admin/system-health`
```
SCREEN A — AI usage. A row of four cost tiles (requests, tokens, spend today, spend MTD), a
wide stacked area chart of daily spend split by feature with a legend, a "Top spenders"
table of agencies with a spend bar per row, and a small "Cap breaches" list with amber chips.

SCREEN B — System health. A grid of eight dependency status cards, each with a large status
dot, the dependency name (PostgreSQL, Redis, S3, Clerk, Stripe, Resend, OpenAI, Browser
pool), a latency figure in monospace, and a 40px sparkline. Six green, one amber, one red.
Below, a chronological incident list with severity chips and timestamps.
```

---

## 7. CLIENT PORTAL (`/portal`)

Deliberately different: **spacious, plain-language, agency-branded, no technical detail.** Replace the shell fragment with a portal header.

### 7.1 `/portal` — overview
```
SCREEN: a simplified, spacious client-facing portal page. No sidebar. A branded top bar with
a generic agency logo placeholder on the left, the client name on the right, and a thin
accent-coloured underline. Centred 960px content column with generous white space and larger
16px body type.
Content: a 30px semibold "Your website is being monitored", then a large 140px circular
health score ring reading "82" in green with the plain-language word "Good" beneath and a
one-sentence interpretation in 16px muted text. Below it, a monitoring-status strip:
"Monitored daily · last checked 3 hours ago" with a small green pulse dot.
Then a card "Items needing attention" containing three rows using plain-word severities —
"Needs attention", "Worth reviewing", "Informational" — each with a coloured dot, a
non-technical one-line description and a date, and no rule IDs or technical values anywhere.
Then a "Recent changes" card with two simple sentences such as "A new tracking service was
detected on 14 March". Finally a "Latest report" card with a document icon, a title, a date
and a download button. Calm, reassuring, uncluttered.
```

### 7.2 `/portal/issues` and `/portal/reports`
```
SCREEN A — Portal issues. The branded portal header, a 30px "Items to review" title, and a
list of simple cards rather than a table: each card has a plain-word severity chip, a
non-technical title, two lines of explanation, a status chip ("Open" / "Being worked on" /
"Resolved") and a date. No monospace, no evidence, no rule IDs.

SCREEN B — Portal reports. A simple grid of report cards, each with a 4:3 bordered PDF cover
thumbnail, a title, a period line and a full-width outline "Download" button.
```

---

## 8. MOBILE (9:19.5, 390×844)

### 8.1 Mobile dashboard
```
SCREEN: the mobile app dashboard on a 390px viewport, rendered as a flat full-bleed screen
with no phone frame. A 56px top bar with a hamburger icon, the wordmark, and a bell icon
with a blue dot. Below: a 2×3 grid of compact stat tiles; then an "Attention Center" section
where each item is a stacked card rather than a table row — severity dot and badge on the
first line, domain in 15px medium, description in 13px muted, timestamp and a small "View"
ghost button on the last line. A simplified sparkline card beneath. A bottom-fixed blue
"Add Website" pill button floating above the content with a soft shadow.
```

### 8.2 Mobile issue detail + mobile filter drawer
```
SCREEN A — Mobile issue detail: a stacked single column with a sticky top bar containing a
back chevron, a truncated title and a "⋯" button; a severity badge row; then the same
ordered sections as desktop but each collapsed into an accordion with only "What happened"
and "Evidence" expanded. A bottom-fixed action bar with an outline "Acknowledge" and a blue
"Resolve" button side by side.

SCREEN B — Mobile filters: the issues list dimmed behind a scrim with a bottom sheet drawer
sliding up two-thirds of the screen, rounded 16px top corners, a small grey grabber handle,
a "Filters" title with a "Reset" text link, then grouped filter sections of tappable chips
and checkbox rows, and a bottom-fixed blue "Show 24 results" button.
```

---

## 9. NON-SCREEN ASSETS

### 9.1 Logo and app icon
```
A minimal, geometric logo mark for "Privacy Drift Monitor": a shield silhouette whose lower
half dissolves into a small stepped waveform or drift line, drawn in a single 2px stroke
weight plus one solid fill. Colour #2563EB on white. Flat vector, no gradient, no bevel, no
3D. Present it four ways on one clean sheet: the mark alone, the mark with the wordmark in
Inter semibold, a 1-colour black version, and a 32px favicon-scale version to prove legibility
at small size. Generous margin, plain white background, no mockups.
```

### 9.2 PDF report pages (A4, 1:1.414)
```
A branded A4 portrait PDF report page for a privacy monitoring report. Page 1: an agency logo
placeholder top left, a thin accent rule, a 40px serif-free semibold title "Monthly Privacy
Monitoring Report", the client name and reporting period, a large centred score ring, and a
small 8px grey legal disclaimer paragraph at the foot.
Page 2 (generate as a second image): a content page with a running header and page number, a
section heading, a summary paragraph, a data table with hairline rules, a small bar chart, and
a bordered screenshot figure with a caption. Print-appropriate: white background, black text,
restrained accent colour, wide margins, no dark backgrounds, no full-bleed colour blocks.
```

### 9.3 Transactional email
```
A transactional HTML email design at 600px width on a #F4F4F5 backdrop. A white rounded card
containing: a small logo at the top, a 24px semibold headline "3 new privacy issues on
acmedental.co.uk", a short muted paragraph, then three compact issue rows each with a severity
dot, a title and a date, then a blue full-width "View in dashboard" button, a thin separator,
and a small grey footer with an unsubscribe link and the legal disclaimer line. Clean,
table-based, no images, no gradients.
```

### 9.4 Open Graph / social card (1.91:1)
```
A 1200x630 Open Graph social card for a B2B SaaS product. Left two-thirds: a 56px semibold
headline "Privacy Drift Monitor" with a 24px muted subline "Continuous consent and tracker
monitoring for agencies". Right third: a cropped, slightly angled fragment of the dashboard UI
bleeding off the right edge. Background white with a very subtle blue radial glow in the
bottom right and a thin 4%-opacity grid pattern. Logo mark top left. No people, no photos.
```

### 9.5 Explainer diagrams
```
A clean flat technical diagram on white, in the visual language of a modern developer-tool
documentation site. Thin 1.5px #71717A connector lines with small arrowheads, rounded 8px
boxes with 1px #E4E4E7 borders and 13px Inter labels, one blue #2563EB highlighted node.
Diagram content: a left-to-right pipeline — "Playwright Chromium" → "Browser Events" →
"Evidence Collector" → "Rule Engine" → "Verified Findings" → branching to both "LLM
Interpretation" and directly to "UI". No 3D, no isometric, no icons-with-gradients, no
clip-art.
```

---

## 10. Consistency & QA checklist

Run each generated screen against this before accepting it:

- [ ] Sidebar and header are pixel-identical to the Dashboard (§5.1)
- [ ] Exactly **one** accent blue; status colours appear only in badges, dots and charts
- [ ] Every severity shows **dot + icon + text** — never colour alone (Part XI §11.3, WCAG 1.4.1)
- [ ] No pass/fail language anywhere — "Detected / Not detected / Could not be determined" (Part I §1.12)
- [ ] No pass/fail **iconography** either: no green ticks or red crosses on a *result*. A tick
      is only ever a progress marker ("this scan stage finished"), never a verdict (§11.1.4)
- [ ] Status pills use the real enum words — issues start at **New**, not "Open"
- [ ] No forbidden terminology in any visible string: *violation, illegal, GDPR breach, non-compliant, you must, confirmed*
- [ ] AI output is visibly labelled and visually separated from deterministic content
- [ ] Technical values are monospace; UI chrome is Inter
- [ ] 8px grid respected; 36px buttons and inputs; 8px radii; 40px table rows
- [ ] Screen is 1440×900 with no device frame, no browser chrome, no perspective
- [ ] Density matches the audience: dense for app/admin, spacious for portal and marketing

---

## 11. Suggested generation order

1. §1 style block calibration (generate a throwaway dashboard, lock the seed)
2. §5.1 Dashboard — the anchor screen
3. §5.2 Websites table — the anchor for every list page
4. §5.13 Issue detail — the anchor for every detail page
5. §5.9 Consent tab, §5.14 Drift feed — the two signature screens for marketing
6. Remaining `/app` screens
7. §7 Portal, §6 Admin
8. §4 Marketing (now that you have real screenshots to composite into heroes)
9. §8 Mobile, §9 assets
