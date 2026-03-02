# Arvis Dashboard — Design System Research & Decisions

## Research Sources

1. **Vercel Web Interface Guidelines** (vercel.com/design/guidelines) — interactions, animations, accessibility, layout
2. **Vercel Geist Typography** (vercel.com/geist/typography) — type scale, font weight usage
3. **Material Design 3 Elevation** (m3.material.io) — dark mode surface elevation via tonal overlays
4. **UIRules.com** — real dark mode color values: bg #0e0f16, surface #12121c, text #f1f2ff
5. **IBM Carbon Design System** — spacing scale, component height standards (xs=24, sm=32, md=40, lg=48px)
6. **8pt Grid Spec** (spec.fm/specifics/8-pt-grid) — base unit 8px, 4pt baseline grid
7. **Smashing Magazine — Vertical Rhythm** — line-height tied to font size ratios
8. **chanhdai.com** (top 1 UI designer, GitHub: ncdai) — grid dividers, monospace data, precise dark palette
9. **cydex dashboard** (reference screenshot) — metric card pattern, sidebar active states, purple chart
10. **Adobe Spectrum Design Tokens** — semantic token naming convention
11. **WCAG 2.1 / APCA** — min 4.5:1 contrast normal text, 3:1 large text; Vercel recommends APCA

---

## Design Decisions & Rationale

### 1. Color System

**Decision:** Hex values, not OKLCH, for predictable cross-browser rendering in dark mode.

**Surface Elevation (Material Design principle applied to our dark palette):**
| Layer | Token | Hex | Use |
|---|---|---|---|
| Base | `--background` | `#09090e` | Page background |
| Surface 1 | `--card` | `#111119` | Cards, panels |
| Surface 2 | `--popover` | `#18182a` | Dropdowns, tooltips |
| Surface 3 | `--accent` | `#1e1e32` | Hover states, active rows |

*Why not pure black (#000)?* Material Design: causes halation — text appears to "bleed" with halos.
*Why not #0a0a0f?* Too similar to card surface, no perceivable elevation.
*Solution:* 7-9 luminosity steps between each layer (perceptible difference).

**Borders:**
- Subtle: `#1c1c2c` — inside-card dividers
- Default: `#232340` — card edges (visible against base)
- Strong: `#2e2e4e` — focus/active emphasis

*Why borders over shadows?* Vercel guidelines + Material M3: shadows invisible in dark mode. Borders are the primary depth cue.

**Text Hierarchy (Material M3 opacity levels):**
- Primary: `#e8e8f2` — 87% white (not 100% — prevents halation)
- Secondary: `#8282a8` — 60% (muted but readable, 4.5:1 contrast against card)
- Disabled: `#44445e` — 38% (subtle, intentionally low contrast)

**Accent: `#7c6af7`** (violet-500 shifted purple)
- Not pure neon — desaturated slightly for comfort on dark bg
- Used SPARINGLY: active states, CTAs, chart strokes only

### 2. Typography Scale

**Font:** Geist Sans (Vercel's own typeface) + Geist Mono for code/data
**Rationale:** Matches Vercel's dashboard aesthetic, free, optimized for screens

**Type Scale (Minor Third 1.2 ratio, rounded to grid):**
| Name | Size | Line Height | Letter Spacing | Weight | Use |
|---|---|---|---|---|---|
| `text-10` | 10px | 14px | +0.02em | 400/500 | Timestamps, labels |
| `text-11` | 11px | 16px | +0.01em | 400/500 | Badges, captions |
| `text-xs` | 12px | 16px | +0.005em | 400/500 | Helper text |
| `text-sm` | 13px | 20px | 0 | 400/500 | Body, nav items ← **default** |
| `text-base` | 14px | 22px | -0.005em | 400/500/600 | Emphasized body |
| `text-lg` | 16px | 24px | -0.01em | 600 | Card titles, section headers |
| `text-xl` | 18px | 28px | -0.015em | 600/700 | Page subtitles |
| `text-2xl` | 20px | 28px | -0.02em | 700 | Page titles |
| `text-3xl` | 24px | 32px | -0.025em | 700 | Metric numbers |
| `text-4xl` | 30px | 36px | -0.03em | 700 | Large metrics |

**Font Weights:**
- 400: Body text, secondary labels
- 500: Nav items, interactive labels (signals "clickable")
- 600: Card titles, section headings, buttons
- 700: Page titles, metric numbers (max contrast hierarchy)

**Line Length:** 60-75 chars optimal (A List Apart). Content areas max 680px wide.

### 3. Spacing Scale (8pt Grid)

**Base unit: 8px.** All spacing is a multiple of 4px (half-base).

| Token | Value | Use |
|---|---|---|
| 0.5 | 2px | Dot sizes, micro gaps |
| 1 | 4px | Icon-to-label tight gap |
| 1.5 | 6px | Badge padding vertical |
| 2 | 8px | Component tight padding |
| 2.5 | 10px | Icon padding, nav icon gap |
| 3 | 12px | Nav item padding-x, badge px |
| 3.5 | 14px | — |
| 4 | 16px | Card padding (default) |
| 5 | 20px | Card padding (comfortable) |
| 6 | 24px | Section spacing (tight) |
| 8 | 32px | Section spacing (default) |
| 10 | 40px | Section spacing (large) |
| 12 | 48px | Page section padding |
| 16 | 64px | Max separation |

### 4. Component Specs (IBM Carbon + Vercel standards)

**Sidebar:** 240px expanded, 56px collapsed (icon-only)
**Header:** 48px height — aligns with 6×8pt
**Buttons:**
- sm: 32px tall, 12px px, 12px font
- md: 36px tall, 14px px, 13px font ← default
- lg: 40px tall, 18px px, 14px font — hit target for touch
**Inputs:** 36px tall, 12px px — same visual weight as button-md
**Nav items:** 32px height, 10px py, 14px px
**Cards:** 12px radius (rounded-xl), 20px padding (comfortable)
**Badges:** 6px radius (rounded-md), 6px px, 2px py, 11px font

### 5. Micro-interactions (Vercel guidelines)

- **GPU-only:** transform, opacity — never width, height, top, left
- **Never `transition: all`** — too broad, causes jank
- **Durations:**
  - Hover bg: 100ms ease
  - Focus ring: 150ms ease
  - Page enter: 200ms ease-out
  - Modal open: 200ms ease-out (simultaneous scale + fade)
  - Modal close: 150ms ease-in
- **prefers-reduced-motion:** All animations must respect it

### 6. Accessibility

- WCAG AA minimum: 4.5:1 normal text, 3:1 large text (18px+ or 14px+ bold)
- All interactive elements: visible `:focus-visible` ring
- Destructive actions: require confirmation
- Tabular numbers (`tabular-nums`) for any numeric comparison data
- `color-scheme: dark` on html element (fixes browser chrome in dark mode)
- No color-only status cues — always text + color

---

## Implementation Checklist

- [x] globals.css design tokens
- [x] Sidebar redesign
- [x] Header redesign
- [x] MetricCard redesign
- [ ] Typography scale applied consistently
- [ ] Activity chart fixed colors
- [ ] All pages using consistent spacing
- [ ] Focus rings on all interactive elements
- [ ] Skeleton loading states match content
