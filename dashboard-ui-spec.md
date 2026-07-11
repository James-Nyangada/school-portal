# Dashboard UI Design Specification

> **Purpose:** This document is a pixel-level design reference for rebuilding the visual UI shown in the reference screenshots. It covers layout, spacing, colors, typography, and component-by-component breakdowns.
>
> **⚠️ IMPORTANT SCOPE NOTE:** This spec covers **presentation/UI only** — layout, styling, components, spacing, colors, icons, and visual states. The existing **authentication/login integration and all backend data-fetching logic already work correctly and must NOT be touched, refactored, or rewired.** Only style/markup/component structure should change to match this spec. Do not rename API calls, change auth flows, modify route guards, or alter data-fetching hooks — only touch presentational components (JSX/CSS/Tailwind classes/layout wrappers).

---

## 1. Overall Application Shell

The app uses a classic **admin dashboard shell** with 3 horizontal zones:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Collapse] Logo/Brand   [Project Switcher ▾]  ...spacer...      │  <- Top Header Bar (fixed, ~64px tall)
├───────────────┬─────────────────────────────────────────┬───────┤
│               │                                          │       │
│  Left Sidebar │           Main Content Area              │ Chat  │
│  (nav, ~268px)│           (scrollable, fluid width)      │ Rail  │
│               │                                          │(56px) │
│               │                                          │       │
├───────────────┴─────────────────────────────────────────┴───────┤
│  Bottom bar (CTA buttons left, tech-stack icons right)           │  <- only on Project dashboard variant
└─────────────────────────────────────────────────────────────────┘
```

- Background of the whole app: very light grey `#F8F8F9` / `#F9FAFB`.
- All panel/card surfaces: white `#FFFFFF` with `border-radius: 12px` and a soft shadow (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)`).
- Base font: system sans-serif stack (Inter / "Helvetica Neue" / Roboto fallback), antialiased.

---

## 2. Left Sidebar Navigation

**Width:** ~268px, full viewport height, white background, right border `1px solid #E5E7EB`.

### 2.1 Header block (top of sidebar)
- Diamond-shaped logo icon (blue, `#3B82F6`–`#2563EB` gradient) + two-line text:
  - Line 1 bold: brand name (e.g. "FUSE")
  - Line 2 small grey: sub-label (e.g. "React")
- To the right: a rounded pill/dropdown button showing current project (icon + name + chevron), dark background `#1F2937`... actually light grey pill with icon, e.g. "⬤ Nextjs ▾"

### 2.2 Navigation groups
Each group has:
- A small uppercase-style **section label** (bold, dark, ~13px) e.g. "Dashboards"
- A **muted grey subtitle** directly under it (~12px, `#9CA3AF`) e.g. "Unique dashboard designs"
- A vertical list of **nav items**, each with:
  - Leading icon (20px, outline style, grey `#6B7280` default)
  - Label text (14px, `#374151`)
  - **Active state:** light blue/grey rounded pill background (`#EEF2FF` or `#F3F4F6`) behind the item, icon+text colored dark/blue, left content padded 12px, rounded corners `8px`
  - Optional trailing badge (small pill, e.g. green "NEW" badge, uppercase, bold, `#10B981` bg with white text)
  - Optional trailing helper text under the label (small grey caption), e.g. "3 upcoming events" under "Calendar"

Groups to reproduce, in order:
1. **Dashboards** — *Unique dashboard designs*
   - Project (active/selected)
   - Analytics
   - Finance
   - Crypto
2. **Applications** — *Custom made application designs*
   - AI Image Generator (badge: "NEW")
   - Academy
   - Calendar (caption: "3 upcoming events")
   - Messenger

### 2.3 Sidebar footer / bottom widgets
- A **help card**: white/light-grey rounded box, bold text "Need assistance to get started?" + blue link with arrow icon "View documentation →"
- Below that, a **user profile row**: circular avatar photo, name (bold, e.g. "Abbott Keitch"), email (small grey, e.g. "admin@fusetheme.com"), and a small circular info icon + chevron-up icon on the right for an account menu.

### 2.4 Collapse behavior
- Top-left of the header has a sidebar-toggle icon button (rounded square, icon = two vertical panel rectangles) to collapse/expand the sidebar. Keep this interactive affordance even if collapse logic is simplified.

---

## 3. Top Header Bar

Full-width, white background, bottom border `1px solid #E5E7EB`, height ~64px, flex row, items vertically centered, `justify-content: space-between`.

**Left side:**
- Sidebar collapse icon button
- Breadcrumb trail (only visible on inner pages): grey text separated by `›`, e.g. `Home › Dashboards › Project`, last (current) breadcrumb item can be same grey (not bold).

**Right side icon cluster** (each ~40px circular/rounded hover targets, icons ~20px, grey `#6B7280`):
- Calendar icon
- Mail/envelope icon
- Contacts/people icon
- Star / favorites icon (filled yellow-orange `#F59E0B` in the reference)
- Language selector pill: small flag icon (e.g. US flag) + "EN" text + chevron
- "Aa" text-size toggle icon
- Fullscreen expand icon
- Sun/light-dark theme toggle icon
- Search (magnifying glass) icon
- Bookmark icon
- Notification bell icon with a small red/blue dot badge top-right corner

**Far right (outside header, docked to viewport edge):** a vertical blue rail/tab (dark blue `#1E3A8A` or brand blue) containing a chat bubble icon — this is the entry point for the right-hand chat/collaboration rail (section 7).

---

## 4. Page Header (inside main content, below top bar)

Pattern used on **every dashboard page**:

```
Home › Dashboards › Project                     [secondary buttons →]
Welcome back, {UserName}!            [Messages]  [⚙ Settings]
📷 avatar  🔔 You have N new messages and M new tasks
```

- **H1 title**: large bold, ~28–32px, black/near-black `#111827`. Personalize with dynamic user name pulled from the existing auth/user context — do not hardcode.
- Directly under: circular small avatar image (32px) + grey helper line with a bell icon, e.g. "You have 2 new messages and 15 new tasks" (dynamic counts from existing data source).
- **Right-aligned action buttons:**
  - "Messages" — dark/black pill button (`#111827` bg, white text, mail icon, rounded-full, ~14px font, padding ~10px 16px)
  - "Settings" — blue pill button (`#3B82F6` bg, white text, gear icon)

### 4.1 Tab bar / context switcher
Directly under the header:
- Segmented pill control (light grey track `#F3F4F6`, rounded-full container) with tabs: **Home | Budget | Team** — active tab has white background pill + shadow, inactive tabs are transparent grey text.
- To the right: a dropdown select styled as an outlined rounded button showing current project/app scope, e.g. "ACME Corp. Backend App ▾" — border `1px solid #E5E7EB`, white bg, rounded-full.

---

## 5. Stat / KPI Cards Row

A responsive 4-column grid (`grid-template-columns: repeat(4, 1fr); gap: 16px`) of white rounded cards, each ~equal width, padding ~20px.

Each card contains:
- **Top row:** small label/dropdown on the left (e.g. "Today ▾" — plain text + chevron, no border) and a 3-dot "more options" icon button on the right (kebab menu, grey, top-right corner).
- **Big number:** very large bold figure, ~40px, near-black, e.g. "25", "4", "32", "42".
- **Caption label** directly under the number, medium grey, ~14px, e.g. "Due Tasks", "Tasks", "Open", "Proposals".
- **Bottom secondary stat line:** small grey text + inline bold/colored value, e.g. "Completed: **7**", "Yesterday's overdue: **2**", "Closed today: **0**", "Implemented: **8**".

Card 1–4 content (reference values — replace with live data bindings, do not hardcode):
| Card | Top label | Big number | Caption | Footer stat |
|---|---|---|---|---|
| 1 | Today ▾ | 25 | Due Tasks | Completed: 7 |
| 2 | (kebab only) | 4 | Tasks (title "Overdue" above number) | Yesterday's overdue: 2 |
| 3 | (kebab only) | 32 | Open (title "Issues" above number) | Closed today: 0 |
| 4 | (kebab only) | 42 | Proposals (title "Features" above number) | Implemented: 8 |

> Note: cards 2–4 show a **section title** ("Overdue", "Issues", "Features") in the same top-left slot instead of a date-dropdown — reuse one Card component with a flexible header slot (either a dropdown or a plain title).

---

## 6. Content Panels Below Stat Cards

### 6.1 "Github Issues Summary" panel (Project dashboard)
- White rounded card, full width, padding ~24px.
- Header row: bold title left ("Github Issues Summary"), right-aligned segmented toggle "This Week | Last Week" (same pill-toggle style as section 4.1, dark active state this time — active = dark `#111827` pill with white text, inactive = plain grey text).
- Below header: two-column sub-layout — left column "New vs. Closed" (line/area chart), right column "Overview" (secondary chart/list). Charts are cut off in the reference at the fold; implement as a **line/area chart component** (see section 8).

### 6.2 Analytics Dashboard specific panels
Page header pattern differs slightly here (no avatar/greeting banner):
- Simple page title block: H1 "Analytics dashboard" (bold, ~26px) + grey subtitle "Monitor metrics, check reports and review performance".
- Right-aligned buttons: "Settings" (dark pill, gear icon) and "Export" (blue pill, upload/export icon).

**"Visitors Overview" card:**
- Header row: bold title "Visitors Overview" + grey subtitle "Number of unique visitors" stacked on the left; right side has a 2-option toggle "This Year | Last Year" (light grey track, active = white pill + shadow).
- Large **area chart** (light blue fill under a blue line, `stroke: #3B82F6`, `fill: rgba(59,130,246,0.15)`), full width, height ~260px, x-axis month labels (Mar '21 … Feb '22), no visible y-axis labels/gridlines except faint horizontal gridlines.

**3-column mini stat cards row** below the chart (Conversions / Impressions / Visits):
- Each: small grey label top-left + small grey pill top-right showing period ("30 days"); big bold number below (e.g. "4,123"); small red trend indicator with down arrow and percentage ("↘ 2% below target"); a tiny sparkline chart at the bottom of the card (area/line, subtle).

**"Visitors vs. Page Views" panel:**
- Header: bold title + grey pill "30 days" top-right.
- Row of 3 metrics: "Overall Score" (big number "472" + green up-arrow "+42.9%"), "Average Ratio" ("45%" + red down-arrow "-13.1%"), "Predicted Ratio" ("55%" + green up-arrow "+22.2%") — each label has a small info "ⓘ" icon beside it.
- Below: a full-width **grey/monochrome area chart** (darker grey fill/line, distinct from the blue chart above), x-axis date labels (20 Dec … 10 Feb).

**"Your Audience" panel:**
- Header: bold title "Your Audience" + grey subtitle "Demographic properties of your users".
- 4-column grid of **donut/ring charts**, one per category: "New vs Returning", "Gender", "Age", "Language". Each column:
  - Small header row: category label + grey "30 days" pill.
  - Centered donut chart (colored ring, ~140px diameter, no center label/hole content shown).
  - Legend below as a small 2-row list: colored dot + label + value + percentage, right-aligned percentage in grey, e.g. "● New 36,868 80%" / "● Returning 9,217 20%".
  - Color per chart: New/Returning = blue tones (`#3B82F6` / `#BFDBFE`); Gender = teal/green tones (`#14B8A6` / `#99F6E4`); Age = orange tones (`#F59E0B` / `#FDE68A`); Language = purple tones (`#8B5CF6` / `#DDD6FE`).

---

## 7. Right-Hand Chat / Collaboration Rail

A slim vertical rail docked to the far right edge of the viewport, ~64–70px wide, light background, containing a **vertical stack of circular user avatars** (each ~40px, small colored online-status dot bottom-right: green = online, others plain).

- Top-most avatar has a small badge showing an unread count (e.g. "2" in a dark rounded pill).
- Some avatars are plain circular initials (colored background + white letter) instead of photos when no photo exists, e.g. "M", "D".
- Two small red/orange floating action buttons appear to the left of this rail mid-page: a gear/settings icon button and a duplicate/copy icon button (both rounded-square, red-orange `#EF4444`/`#F97316` bg, white icon, stacked vertically, likely a "quick actions" floating menu).

Implement this as a persistent right rail component that lists active collaborators/contacts, independent of page content, scrolling with the page or fixed — match the reference (appears fixed to viewport height).

---

## 8. Bottom Utility Bar (Project dashboard only)

Fixed/sticky bar at the very bottom of the viewport, white background, top border `1px solid #E5E7EB`, flex row `justify-content: space-between`, padding ~12px 24px.

- **Left:** two dark pill buttons side by side:
  - "Purchase FUSE React" (black bg `#111827`, white text, shopping-cart icon)
  - "Documentation" (dark grey/black bg, white text, document icon)
- **Right:** a row of small circular tech-stack badge icons (colored logos in circular chips): settings gear, React/atom logo, Tailwind logo, Next.js logo, TypeScript "TS" badge, etc. Purely decorative brand icons, ~28px each, spaced 8px apart.

---

## 9. Design Tokens Summary

```css
:root {
  /* Surfaces */
  --bg-app: #F8F9FA;
  --bg-card: #FFFFFF;
  --border-subtle: #E5E7EB;

  /* Text */
  --text-primary: #111827;
  --text-secondary: #4B5563;
  --text-muted: #9CA3AF;

  /* Brand / Accent */
  --color-primary: #3B82F6;       /* blue - primary buttons, active states, links */
  --color-primary-dark: #1D4ED8;
  --color-dark-pill: #111827;     /* black pill buttons e.g. "Messages" */
  --color-success: #10B981;       /* green badges, positive trend arrows */
  --color-danger: #EF4444;        /* negative trend arrows, red accents */
  --color-warning: #F59E0B;       /* star icon, orange accents */
  --color-teal: #14B8A6;
  --color-purple: #8B5CF6;

  /* Radius & Shadow */
  --radius-card: 12px;
  --radius-pill: 999px;
  --radius-btn: 10px;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);

  /* Spacing scale */
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;

  /* Typography */
  --font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  --text-xs: 12px; --text-sm: 14px; --text-base: 16px;
  --text-lg: 20px; --text-xl: 26px; --text-2xl: 32px;
  --font-weight-bold: 700; --font-weight-semibold: 600;
}
```

---

## 10. Component Inventory (build/reuse these as discrete components)

1. `SidebarNavGroup` — section label + subtitle + list of `SidebarNavItem`
2. `SidebarNavItem` — icon, label, active state, optional badge, optional caption
3. `TopHeaderBar` — collapse toggle, breadcrumb, icon cluster, language selector
4. `PageHeaderBanner` — avatar, greeting title, notification line, action buttons slot
5. `PillToggleGroup` — 2–3 option segmented control (used for tabs, "This Week/Last Week", "This Year/Last Year")
6. `StatCard` — flexible header slot (dropdown OR title text) + kebab menu + big number + caption + footer stat line
7. `MiniMetricCard` — label + period pill + big number + trend arrow/percentage + sparkline
8. `AreaLineChart` — reusable chart for Visitors Overview (blue) and Visitors vs Page Views (grey), config-driven color
9. `DonutChartCard` — header (label + period pill) + donut chart + legend list with colored dots and percentages
10. `RightCollaboratorRail` — vertical avatar stack with status dots and unread badge
11. `BottomUtilityBar` — CTA buttons + tech icon strip
12. `Button` variants: `pill-dark`, `pill-primary`, `pill-outline`
13. `IconButton` — circular hover-highlight icon button used throughout header/cards

---

## 11. Explicit Build Rules for the Agent

1. **Do not touch** authentication/login logic, protected route guards, session handling, or any API/data-fetching hooks currently wired to this UI. Only replace the JSX structure, CSS classes, and static/presentational props.
2. Wherever this spec shows a hardcoded example value (names, numbers, percentages), **bind it to the existing live data source/props** already used in the current implementation — do not hardcode reference values from the screenshots.
3. Match spacing, radii, and color tokens from Section 9 as closely as possible using the project's existing styling system (Tailwind CSS utility classes preferred if the codebase already uses Tailwind).
4. Reuse a single component per repeated pattern (see Section 10) rather than duplicating markup per page — the same `StatCard`, `PillToggleGroup`, and `AreaLineChart` components should power both the Project and Analytics dashboards.
5. Preserve responsive behavior: sidebar should collapse to icons-only or hide on smaller breakpoints; the 4-column stat grid should collapse to 2-column (tablet) and 1-column (mobile); the 4-column donut chart grid should do the same.
6. Keep all icons as outline-style (stroke-based), consistent stroke width (~1.5–2px), consistent sizing (20px in nav/header, 16–18px inside cards).
7. Preserve the right-hand collaborator rail and bottom utility bar as persistent layout elements, not page-specific content.
