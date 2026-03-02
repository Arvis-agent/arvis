# Arvis Dashboard — Design Audit

Audit performed: 2026-03-02
Auditor: Full file-by-file review of all pages, sections, components, and utilities.

---

## SPACING ISSUES

### S-1: Page title inconsistency — `text-lg` vs `text-base`
**Files affected:**
- `agents/page.tsx` line 228: `<h1 className="text-lg font-semibold">Agents</h1>`
- `sessions/page.tsx` line 128: `<h1 className="text-lg font-semibold">Sessions</h1>`
- `usage/page.tsx` line 61: `<h1 className="text-lg font-semibold">Usage</h1>`
- `queue/page.tsx` line 131: `<h1 className="text-lg font-semibold">Queue</h1>`
- `workflows/page.tsx` line 240: `<h1 className="text-lg font-semibold">Workflows</h1>`
- `skills/page.tsx` line 369: `<h1 className="text-lg font-semibold">Skills</h1>`
- `logs/page.tsx` line 66: `<h1 className="text-lg font-semibold">Logs</h1>`
- `settings/page.tsx` line 87: `<h1 className="text-lg font-semibold">Settings</h1>`
- `agents/[id]/page.tsx` line 545: `<h1 className="text-lg font-semibold">{agent.name}</h1>`

**Correct value:** `text-base font-semibold` (used correctly on overview page)
**Fix:** Change all `text-lg` to `text-base` on page-level h1 elements.

### S-2: Section gap inconsistency — `space-y-5` vs `space-y-6`
**Files affected:**
- `page.tsx` (overview) line 67: `<div className="space-y-5">` — uses `space-y-5`
- `agents/[id]/page.tsx` line 535: `<div className="space-y-5">` — uses `space-y-5`
- All other pages use `space-y-6`

**Correct value:** `space-y-6`
**Fix:** Change `space-y-5` to `space-y-6` on overview page and agent detail page outer wrapper.

### S-3: Section header padding inconsistency in health section
**File:** `settings/_sections/health-section.tsx` line 62:
```tsx
<div className="px-4 py-3 border-b border-border bg-muted/10">
```
This section header is missing the `flex items-center justify-between` wrapper that all other section headers use (even without an action button, the pattern should be consistent).

### S-4: Table header padding inconsistency
- **agents/page.tsx** table header: `px-3 py-2.5` (uses px-3 not px-4)
- **agents/page.tsx** data rows: `px-3 py-3` (uses px-3 not px-4, and py-3 is too tall)
- All other tables: `px-4 py-2.5` for header, `px-4 py-2.5` or `px-4 py-3` for rows

**Fix:** Standardize agents table header + rows to `px-4 py-2.5` header, `px-4 py-2.5` data rows.

### S-5: Overview "Recent Activity" section wrapper is inconsistent with page pattern
**File:** `page.tsx` lines 141–185
The "Recent Activity" section uses an ad-hoc `<div>` with a manual header row (not the standard SECTION CARD PATTERN). It has no border on the header, different spacing than section cards.
**Fix:** Wrap in the standard section card pattern with a proper `px-4 py-3 border-b border-border bg-muted/10` header.

### S-6: Usage page SummaryCard padding — `p-5` instead of `p-4`
**File:** `usage/page.tsx` line 188: `<div className="rounded-md border border-border p-5">`
Overview MetricCard uses `p-4`. Should be `p-4` everywhere.
**Fix:** Change `p-5` to `p-4` in SummaryCard.

### S-7: Usage page SummaryCard label — missing `tracking-wider`
**File:** `usage/page.tsx` line 190:
```tsx
<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
```
Overview MetricCard uses `tracking-wider`. `tracking-wide` vs `tracking-wider` inconsistency.
**Fix:** Change `tracking-wide` to `tracking-wider`.

### S-8: Empty state padding inconsistency
**File:** `empty-state.tsx` component uses `py-16`
But manual inline empty states use different values:
- `orchestrator-section.tsx` line 111: `py-10`
- `orchestrator-section.tsx` line 119–123: no py class on inner div, just a `py-6`
- `bots-section.tsx` line 414–418: `py-12`
- `webhooks-section.tsx` line 160–164: `py-12`
- `accounts-section.tsx` line 461–465: `py-12`

**Fix:** Inline empty states in settings sections use py-12. The EmptyState component uses py-16. Settings sections should use the `<EmptyState>` component, not inline patterns.

### S-9: Queue page section header padding — `py-2.5` vs `py-3`
**File:** `queue/page.tsx` Section component line 265:
`'flex items-center justify-between px-4 py-2.5 border-b'`
Settings sections use `py-3` for section headers.
**Fix:** Change `py-2.5` to `py-3` in queue Section component.

### S-10: Workflow WfRow top-level div missing border-b
**File:** `workflows/page.tsx` WfRow component — the entire `<div>` for a workflow row has no border between rows. The parent container uses `divide-y divide-border/50` which provides the dividers, but the expand panel (`open && ...`) breaks the divide pattern because it's inside the same `<div>`.
This is functionally acceptable but visually the expand panel border uses `border-t border-border/50` which is consistent.

---

## TYPOGRAPHY ISSUES

### T-1: Agents table ColHeader font size — `text-xs` instead of `text-[10px]`
**File:** `agents/page.tsx` ColHeader component line 346:
```tsx
<span className={`text-xs font-medium text-muted-foreground uppercase tracking-wider...`}>
```
Overview table header uses `text-[10px]`. Sessions, Logs, Skills all use `text-xs` for ColHeader. Queue uses `text-[10px]`.
**Decision:** Standardize to `text-[10px]` for ALL ColHeader / table header cells (consistent with Overview).

### T-2: Sessions and Logs ColHeader — `text-xs` instead of `text-[10px]`
Same as T-1. Sessions `page.tsx` ColHeader line 337 and Logs `page.tsx` ColHeader line 195 both use `text-xs`.
**Fix:** Change to `text-[10px]`.

### T-3: Skills ColHeader — `text-xs` instead of `text-[10px]`
**File:** `skills/page.tsx` ColHeader line 545: uses `text-xs`.
**Fix:** Change to `text-[10px]`.

### T-4: Usage page Provider table — row uses `text-sm` for provider name
**File:** `usage/page.tsx` line 128:
```tsx
<span className="text-sm text-muted-foreground capitalize">{p.provider}</span>
```
All other data rows use `text-xs`. This is `text-sm` which is too large for table data.
**Fix:** Change to `text-xs`.

### T-5: Usage page Agent table — `text-sm` for agent name
**File:** `usage/page.tsx` line 156:
```tsx
<span className="text-sm text-foreground">{a.agent_name}</span>
```
Should be `text-xs text-foreground` for table consistency.
**Fix:** Change to `text-xs`.

### T-6: Sessions table agent name — `text-sm font-medium` is fine (primary cell)
**File:** `sessions/page.tsx` line 208: `text-sm font-medium` for agent name.
This is the primary identifier in an expandable row; `text-sm` is acceptable for the primary column only. Keep as-is.

### T-7: Queue page job row agent name — `text-sm`
**File:** `queue/page.tsx` line 339:
```tsx
<span className="text-sm text-foreground truncate block">
  {job.agent_name ?? `Agent ${job.agent_id}`}
</span>
```
Should be `text-xs text-foreground` for table consistency with other pages.
**Fix:** Change to `text-xs`.

### T-8: Workflows section heading style — `text-muted-foreground uppercase tracking-wider`
**File:** `workflows/page.tsx` Section component line 337:
```tsx
<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title} ({count})</h2>
```
This is styled as a sub-label (muted, uppercase) rather than a section heading (foreground, no uppercase). The Queue page Section uses `text-foreground` for its heading. Should be standardized.
**Fix:** Change to `text-sm font-medium` (no uppercase, no tracking-wider, use foreground color as default — let queue highlight override).

### T-9: Activity chart label says "7 days" but data may be different ranges
**File:** `activity-chart.tsx` line 52: Hard-coded `<span className="font-mono text-xs text-muted-foreground">7 days</span>`. This label is always "7 days" even when used on the Usage page where range can be 30d or 90d.
**Note:** This is a functionality concern but also a typography/accuracy issue. The chart is shared between Overview (7 days) and Usage (range varies). The Usage page should pass the range label or the chart should not show a hard-coded label.
**Fix:** Make the time label a prop; default `"7 days"`. Usage page passes the range label.

### T-10: Skill detail section labels inconsistency
**File:** `skills/page.tsx` SkillDetail — some section labels use `.uppercase tracking-wider`, some don't:
- "Trigger Patterns" label: `text-xs font-medium text-muted-foreground uppercase tracking-wider` ✓
- "File" label: same ✓
- "Content" label: same ✓
These are all consistent internally. Good.

### T-11: Health section StatusRow uses `text-sm` implicitly (via parent `text-sm`)
**File:** `health-section.tsx` line 36: `<div className="space-y-2.5 text-sm">` — all children inherit text-sm. The label in StatusRow is `text-muted-foreground` (from parent text-sm). This is slightly large for status table rows but consistent internally with the Health section.
**Note:** Minor — leave as-is since this section is display-only, not a data table.

---

## COLOR ISSUES

### C-1: Status dot size inconsistency — `h-2 w-2` vs `h-1.5 w-1.5`
**Files affected:**
- `agents/page.tsx` line 292: `h-2 w-2 rounded-full` — TOO LARGE
- `workflows/page.tsx` WfRow line 368: `h-2 w-2 rounded-full` — TOO LARGE
- `sessions/page.tsx` line 223: `h-1.5 w-1.5 rounded-full` ✓
- `logs/page.tsx` line 150: `h-1.5 w-1.5 rounded-full` ✓
- `bots-section.tsx` line 438: `h-1.5 w-1.5 rounded-full` ✓
- `health-section.tsx` line 16: `h-1.5 w-1.5 rounded-full` ✓
- `health-section.tsx` line 75: `h-1.5 w-1.5 rounded-full` ✓
- `queue/page.tsx` Section header "active" dot line 176: `h-3.5 w-3.5` spinner — this is a spinner, not a status dot, acceptable

**Correct value:** `h-1.5 w-1.5 rounded-full`
**Fix:** Change agents `h-2 w-2` and workflows `h-2 w-2` to `h-1.5 w-1.5`.

### C-2: Border color inconsistency — `border-border/50` vs `border-border/40`
**Files:**
- `agents/page.tsx` data rows: `border-border/50` ✓
- `queue/page.tsx` data rows: `border-border/40`
- `overview/page.tsx` data rows: `border-border/40`

**Decision:** Standardize to `border-border/50` for all data row dividers.
**Fix:** Change `border-border/40` instances in queue and overview to `border-border/50`.

### C-3: Workflows "None configured" empty state — raw `<p>` not EmptyState component
**File:** `workflows/page.tsx` line 344:
```tsx
<p className="text-sm text-muted-foreground">None configured</p>
```
When a section (Heartbeats or Cron Jobs) has no items, it shows a bare `<p>` with no icon. Should use a minimal empty indicator or at least be visually consistent.
**Fix:** Wrap in a consistent empty state `<div>` with proper padding.

### C-4: Webhook section row icon size inconsistency
**File:** `webhooks-section.tsx` line 171: `h-8 w-8` icon container
**File:** `bots-section.tsx` line 428: `h-8 w-8` icon container
**File:** `accounts-section.tsx` line 473: `w-7 h-7` icon container (different!)
**File:** `orchestrator-section.tsx` line 201: `h-6 w-6` icon container (different!)

All platform/account icon containers should be the same size. The accounts section uses `w-7 h-7` and the agent config section uses `h-6 w-6`.
**Fix:** Standardize all section list item icon containers to `h-7 w-7`.

### C-5: Bots section empty state — uses `h-8 w-8` for Bot icon
**File:** `bots-section.tsx` line 415: `<Bot className="h-8 w-8" />` — correctly matches EmptyState pattern.
But `orchestrator-section.tsx` line 112: `<Bot className="h-7 w-7" />` — uses `h-7 w-7`, smaller than pattern.
**Fix:** Change orchestrator empty state Bot icon to `h-8 w-8`.

### C-6: Orchestrator section Crown empty state icon size — `h-6 w-6`
**File:** `orchestrator-section.tsx` line 120: `<Crown className="h-6 w-6" />` — too small for empty state icon.
Standard empty state icon size is `h-8 w-8`.
**Fix:** Change to `h-8 w-8`.

---

## COMPONENT ISSUES

### CM-1: Inconsistent dialog `rounded` size — `rounded-lg` vs `rounded-md`
**File:** `dialog.tsx` line 37: `rounded-lg border border-border`
The design system uses `rounded-md` for cards and containers (globals.css `--radius: 0.25rem`). Dialogs using `rounded-lg` breaks this rule.
**Fix:** Change dialog container from `rounded-lg` to `rounded-md`.

### CM-2: Dialog content wrapper uses `py-5` but form dialogs have nested `pt-2 border-t` footer
The dialog inner content area uses `px-5 py-5` which means the form footer `pt-2 border-t border-border` sits with `5px (py-5=20px) + 2px (pt-2=8px)` of space above it. The bottom edge then has `py-5=20px` of space. This is consistent and fine but worth noting.

### CM-3: Skills page toggle switch uses `h-4 w-7` with `h-2.5 w-2.5` thumb
**File:** `skills/page.tsx` lines 507–522. The custom toggle is slightly smaller than common pattern. This is intentional as a compact inline toggle. Acceptable.

### CM-4: Inconsistent "Custom/Preset" model toggle button between pages
**File:** `agents/page.tsx` (create dialog) line 139:
```tsx
<button type="button" ... className="px-2.5 rounded-md border border-border text-xs ...">
```
**File:** `agents/[id]/page.tsx` (edit form) line 244:
```tsx
<button type="button" ... className="px-2.5 rounded-md border border-border text-xs ...">
```
These are identical — good.

### CM-5: Workflows dialog textarea uses raw `<textarea>` not `<Textarea>` component
**File:** `workflows/page.tsx` line 139–151: Uses raw `<textarea>` with manual className. The `<Textarea>` component should be used for visual consistency.
**Fix:** Replace raw `<textarea>` with `<Textarea>` component.

### CM-6: Webhooks dialog textarea uses raw `<textarea>` not `<Textarea>` component
**File:** `webhooks-section.tsx` lines 80–87: Uses raw `<textarea>` with manual className.
**Fix:** Replace with `<Textarea>` component.

### CM-7: Orchestrator section ImportAgentDialog uses raw `<textarea>` not `<Textarea>` component
**File:** `orchestrator-section.tsx` lines 49–55: Uses raw `<textarea>` with manual className.
**Fix:** Replace with `<Textarea>` component.

### CM-8: Agent detail overview tab — `Row` component label uses `text-muted-foreground` (text-sm via parent)
**File:** `agents/[id]/page.tsx` Row function line 649:
```tsx
<span className="text-muted-foreground">{label}</span>
```
The parent div has no explicit font size — it inherits the section's context. Should explicitly be `text-xs text-muted-foreground` for clarity and consistency with other key-value displays.

### CM-9: Empty state in queue "No running/pending jobs" uses bare `<p>` instead of EmptyState
**File:** `queue/page.tsx` lines 185 and 205:
```tsx
<p className="py-6 text-center text-sm text-muted-foreground">No running jobs</p>
<p className="py-6 text-center text-sm text-muted-foreground">Queue is empty</p>
```
Failed section uses `<EmptyState>` component but running/pending sections use bare `<p>`.
**Fix:** Standardize — bare `<p>` is acceptable for minimal sections like "No running jobs" and "Queue is empty" since they're not primary empty states. However, `py-6` should become `py-8` for better visual weight.

### CM-10: Orchestrator section — no `bg-muted/20` on section table headers
The orchestrator conductor list and Agent Configs section don't have table header rows at all, so N/A. The section card headers match the standard pattern.

### CM-11: Skills page header row is OUTSIDE the `overflow-x-auto` wrapper
**File:** `skills/page.tsx` lines 451–459: The table header row is rendered as a sibling of the `overflow-x-auto` div, not inside it. This means on narrow screens, the header row won't scroll horizontally with the data rows. The data rows are inside `min-w-[540px]` but the header is outside.
**Fix:** Move the header row inside the `overflow-x-auto` and `min-w-[540px]` wrappers.

---

## LAYOUT ISSUES

### L-1: Overview page missing subtitle padding alignment
**File:** `page.tsx` line 68: The overview page header is `flex items-center justify-between` (good) but has no subtitle. Other pages have a subtitle paragraph. Overview uses the live indicator instead. This is intentional and fine.

### L-2: Sessions page refreshCW button uses `h-8 w-8` but Usage and Skills use `h-8 w-8` too
All refresh icon buttons: `h-8 w-8` items-center justify-center rounded — consistent across sessions, usage, skills, logs. Good.

### L-3: Workflows page refresh button uses `Button` component with `variant="ghost" size="icon"`
**File:** `workflows/page.tsx` line 246:
```tsx
<Button variant="ghost" size="icon" onClick={...}>
  <RefreshCw className={cn('h-4 w-4', ...)} />
</Button>
```
Other pages use a raw `<button>` with `h-8 w-8` pattern. Button `size="icon"` renders `h-9 w-9` which is slightly larger. The icon is also `h-4 w-4` while other pages use `h-3.5 w-3.5`.
**Fix:** Change to raw `<button>` pattern with `h-8 w-8` and `h-3.5 w-3.5` icon for consistency.

### L-4: Agent detail page back button uses `ArrowLeft h-4 w-4` — larger than design system
**File:** `agents/[id]/page.tsx` lines 538–540:
```tsx
<ArrowLeft className="h-4 w-4" /> Agents
```
The icon is `h-4 w-4`. Most inline action icons use `h-3.5 w-3.5`. Within a Button `size="sm"` context this is slightly oversized.
**Fix:** Change to `h-3.5 w-3.5`.

### L-5: Workflows page section headers not using standard section card pattern
**File:** `workflows/page.tsx` Section component — uses an ad-hoc section header div without a border-b or bg-muted/10. Each section (Heartbeats / Cron Jobs) has a header rendered via the Section component's `flex items-center justify-between mb-3` but it's not wrapped in the standard `rounded-md border border-border` section card.
The content IS wrapped in `rounded-md border border-border divide-y divide-border/50 overflow-hidden`.
This is a slight inconsistency — section cards should use the standard pattern with a header bar, not a floating header above a card.
**Fix:** Refactor Section component to use standard section card pattern (header inside the rounded-md container).

---

## INTERACTION ISSUES

### I-1: Workflows WfRow toggle dot — missing `cursor-pointer` class
**File:** `workflows/page.tsx` line 362: The enable/disable button dot uses `transition-colors hover:scale-125` but no `cursor-pointer`. Buttons default to `cursor-default` on some browsers.
**Fix:** Add `cursor-pointer` to the toggle dot button.

### I-2: Skills page toggle button — no `cursor-pointer`
**File:** `skills/page.tsx` line 506–523: The toggle switch `<button>` has no cursor-pointer class.
**Fix:** Add `cursor-pointer` to ensure correct pointer cursor.

### I-3: Orchestrator section conductor row — no explicit `cursor-pointer` when not selected
The conductor selection row uses a `<button>` element so it automatically gets pointer cursor. Fine.

### I-4: Agent list status text color — redundant with status dot
**File:** `agents/page.tsx` lines 298–301: Shows both a status dot and colored status text. The status text uses `text-emerald-400 / text-yellow-400` while the STATUS_DOT shows the same information. This is intentional dual-indication.

### I-5: Missing `title` attribute on some action buttons
**File:** `skills/page.tsx` ImportUrlDialog cancel button: has no title attribute. Minor accessibility gap.
**File:** `logs/page.tsx` refresh button: has title="Refresh" ✓
Most buttons have titles — this is minor.

---

## PAGE-SPECIFIC ISSUES

### P-OVERVIEW: Recent Activity section inconsistency
The "Recent Activity" section at the bottom of overview uses:
- A manual `<div className="flex items-center justify-between mb-3">` header
- NO section card wrapper pattern

The page mixes section card pattern (for future use) with ad-hoc section headers. Activity chart also uses an ad-hoc `mb-3` header.

**Fix:** Wrap both the ActivityChart section and Recent Activity section in standard section card wrappers.

### P-AGENTS: Table header `px-3` vs standard `px-4`
See S-4.

### P-SESSIONS: Header structure differs from other pages
Sessions page has `h1` + subtitle + a standalone refresh `<button>`. Other pages (Usage, Skills, Logs) have the same pattern. Queue page has the auto-refresh toggle. Consistent enough.

### P-USAGE: Section headings lack standard card pattern
"By Provider / Model" and "By Agent" sections use:
```tsx
<div className="data-enter">
  <h2 className="text-sm font-medium mb-3">By Provider / Model</h2>
  <div className="rounded-md border border-border overflow-hidden">...
```
The `<h2>` is a floating heading above the card, not inside it. This is inconsistent with the section card pattern where the heading is inside the card as a bordered header bar.
**Fix:** Wrap in section card pattern with header bar.

### P-QUEUE: Section header `py-2.5` vs standard `py-3`
See S-9.

### P-SKILLS: Table header outside `overflow-x-auto` wrapper
See CM-11.

### P-LOGS: Agent shown as numeric ID not name in table
**File:** `logs/page.tsx` line 148:
```tsx
<span className="font-mono text-xs text-muted-foreground/60 truncate">{job.agent_id}</span>
```
The logs page shows the numeric `agent_id` in the Agent column, but the API doesn't return `agent_name`. This is a data issue but worth noting for UX. Not a design system issue per se, but the column label says "Agent" and shows a number.

### P-SETTINGS-ORCHESTRATOR: Empty state icon sizes inconsistent
See C-5, C-6.

### P-SETTINGS-HEALTH: Platform connectors grid uses ad-hoc border pattern
**File:** `health-section.tsx` lines 70: `border-b sm:border-b-0 sm:border-r border-border/50` applied conditionally based on index. This creates a custom grid border pattern that is not part of the standard design system. Acceptable for a specialized grid layout but slightly complex.

---

## SUMMARY COUNT
- Spacing: 10 issues (S-1 through S-10)
- Typography: 11 issues (T-1 through T-11)
- Colors: 6 issues (C-1 through C-6)
- Components: 11 issues (CM-1 through CM-11)
- Layout: 5 issues (L-1 through L-5)
- Interactions: 5 issues (I-1 through I-5)
- Page-specific: 7 issues (P-*)
- **Total: 55 issues logged**

---

## DESIGN SYSTEM (Established after audit)

```
SPACING SCALE:
  Page outer gap:      space-y-6
  Card padding:        p-4
  Section header:      px-4 py-3
  Table header:        px-4 py-2.5
  Table data row:      px-4 py-2.5
  Dialog padding:      px-5 py-5 (content), px-5 py-4 (header)
  Button sm:           h-8 px-3 text-xs
  Button default:      h-9 px-4 text-sm
  Button icon:         h-8 w-8 (raw button); h-9 w-9 (Button component size="icon")

TYPOGRAPHY:
  Page title:          text-base font-semibold
  Section heading:     text-sm font-medium (inside section card header)
  Sub-label:           text-xs text-muted-foreground/60
  Table header cells:  text-[10px] font-medium uppercase tracking-wider text-muted-foreground
  Table cell text:     text-xs (text-foreground for primary; text-muted-foreground for secondary)
  Mono numbers:        font-mono tabular-nums
  Badge text:          font-mono text-xs (via Badge component)
  Muted secondary:     text-muted-foreground/50 for timestamps, text-muted-foreground/60 for sub-labels

BORDERS + COLORS:
  Card border:         border-border
  Data row divider:    border-border/50 (NOT /40)
  Section divider:     divide-border/50
  Hover row:           hover:bg-muted/10 transition-colors
  Header row bg:       bg-muted/20
  Section header bg:   bg-muted/10

STATUS DOTS:
  Size:                h-1.5 w-1.5 rounded-full (NOT h-2)
  Running/ok/active:   bg-emerald-500
  Paused/pending:      bg-yellow-500
  Failed/error:        bg-red-500
  Stopped/off/archived:bg-muted-foreground/30

SECTION CARD PATTERN (standard):
  <div className="rounded-md border border-border overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {/* optional action */}
    </div>
    {/* content */}
  </div>

EMPTY STATE PATTERN (component):
  EmptyState icon wrapper uses h-8 w-8 icons
  py-16 for full-page empty states
  Use <EmptyState> component, not inline patterns

PAGE HEADER PATTERN (standard):
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
    {/* optional action */}
  </div>

SECTION FLOATING HEADER (for non-card sections):
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-sm font-medium">{title}</h2>
    {/* optional action */}
  </div>
```
