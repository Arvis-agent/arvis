# Arvis Dashboard — Design Rules

Authoritative, complete design system for the dashboard. Every page and component MUST follow these rules exactly. No exceptions without explicit approval.

---

## 1. Spacing Tokens

| Token | Class | Notes |
|-------|-------|-------|
| Page outer wrapper | `space-y-6` | NEVER `space-y-5` or `space-y-4` |
| Card / section body padding | `p-4` | NEVER `p-5` |
| Section card header | `px-4 py-3` | Header bar inside bordered card |
| Table header row | `px-4 py-2.5` | Inside `overflow-x-auto > min-w` wrapper |
| Table data row | `px-4 py-2.5` | Same as header |
| Dialog header | `px-5 py-4` | |
| Dialog body | `px-5 py-5` | |
| Inline empty state (with icon) | `py-12 text-center` | |
| Inline empty state (text only) | `py-8 text-center` | No icon present |
| Page bottom padding | None on page | Layout wrapper provides `py-6` |

---

## 2. Typography Tokens

| Element | Class |
|---------|-------|
| Page h1 | `text-base font-semibold` |
| Page subtitle | `text-sm text-muted-foreground mt-0.5` |
| Section card heading | `text-sm font-medium` — inside `px-4 py-3 border-b` header |
| Table column header | `text-[10px] font-medium text-muted-foreground uppercase tracking-wider` |
| Table cell primary text | `text-xs text-foreground` |
| Table cell secondary text | `text-xs text-muted-foreground` |
| Monospace identifiers | `font-mono text-xs text-muted-foreground` |
| Timestamps | `font-mono text-[10px] text-muted-foreground/50 tabular-nums` |
| Metric label | `text-[10px] font-medium text-muted-foreground uppercase tracking-wider` |
| Metric value | `font-pixel text-3xl tabular-nums leading-none` |

---

## 3. Colors and Borders

| Token | Class |
|-------|-------|
| Card border | `border-border` |
| Row dividers | `border-border/50` — NEVER `/40` |
| Last row divider | `last:border-0` — always remove bottom border on last row |
| Row hover | `hover:bg-muted/10` — NEVER `/20` |
| Table header background | `bg-muted/20` |
| Section card header background | `bg-muted/10` |
| Status dot: running / ok | `bg-emerald-500` |
| Status dot: paused / warn | `bg-yellow-500` |
| Status dot: error / failed | `bg-red-500` |
| Status dot: stopped / off | `bg-muted-foreground/30` |
| Status dot size | `h-1.5 w-1.5 rounded-full` — NEVER `h-2 w-2` |

---

## 4. Component Rules

### Containers
- All cards, sections, dialogs: `rounded-md` — NEVER `rounded-lg`
- `rounded-lg` is only acceptable on chat message bubbles

### Buttons
- Page refresh button: raw `<button>` with `h-8 w-8 flex items-center justify-center rounded`, icon `h-3.5 w-3.5`
- Do NOT use `<Button size="icon">` for page-level refresh (it renders `h-9 w-9`)
- Section list icon container: `h-7 w-7` with icon `h-3.5 w-3.5` inside
- Action icon in table row: `h-3 w-3`
- Page-level action icon: `h-3.5 w-3.5`
- Toggle buttons and clickable non-button elements: add `cursor-pointer`

### Textarea
- ALWAYS use `<Textarea>` from `@/components/ui/textarea`
- NEVER use raw `<textarea>` element

### Select
- ALWAYS use `<Select>` from `@/components/ui/select`

### Empty State icon
- Size: `h-8 w-8`
- NEVER `h-6 w-6` for EmptyState icons

---

## 5. Mandatory Component Patterns

### Page Header Pattern
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-base font-semibold">{title}</h1>
    <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
  </div>
  {/* optional: refresh button */}
  <button
    className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    onClick={handleRefresh}
    title="Refresh"
  >
    <RefreshCw className="h-3.5 w-3.5" />
  </button>
</div>
```

### Section Card Pattern (mandatory for ALL named sections)
```tsx
<div className="rounded-md border border-border overflow-hidden">
  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
    <div>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>  {/* omit if no subtitle */}
    </div>
    {/* optional action button */}
  </div>
  {/* content — usually p-4 or divide-y divide-border/50 */}
</div>
```

**Rule:** Do NOT use a bare `<h2 className="text-sm font-medium mb-3">` floating inside a `p-4` card. The heading MUST be in the `px-4 py-3 border-b` header bar.

### ColHeader Component (define per file)
```tsx
function ColHeader({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[10px] font-medium text-muted-foreground uppercase tracking-wider${right ? ' text-right' : ''}`}>
      {children}
    </span>
  );
}
```

### Table Pattern
```tsx
<div className="rounded-md border border-border overflow-hidden">
  <div className="overflow-x-auto">
    <div className="min-w-[540px]">
      {/* Column header row — MUST be inside overflow-x-auto + min-w wrapper */}
      <div className="grid grid-cols-[...] border-b border-border px-4 py-2.5 bg-muted/20">
        <ColHeader>Name</ColHeader>
        <ColHeader right>Actions</ColHeader>
      </div>
      {/* Data rows */}
      {items.map((item) => (
        <div
          key={item.id}
          className="grid grid-cols-[...] items-center px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors"
        >
          {/* cells — use text-xs for all cell text */}
          <span className="text-xs text-foreground">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.secondary}</span>
        </div>
      ))}
    </div>
  </div>
</div>
```

Key table rules:
- Column header MUST be inside `overflow-x-auto > min-w` wrapper
- Row dividers: `border-border/50`
- Last row: `last:border-0`
- Hover: `hover:bg-muted/10`
- All cell text: `text-xs` (never `text-sm`)

### Inline Empty State (with icon, inside a section card body)
```tsx
<div className="py-12 text-center">
  <IconName className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
  <p className="text-sm text-muted-foreground">No items yet</p>
  <p className="text-xs text-muted-foreground mt-1">Descriptive helper text</p>
  {/* optional: action button */}
  <Button size="sm" className="mt-4" onClick={onCreate}>Create</Button>
</div>
```

### Inline Empty State (text only, no icon)
```tsx
<div className="py-8 text-center">
  <p className="text-sm text-muted-foreground">No items</p>
</div>
```

### EmptyState Component Usage
```tsx
<EmptyState
  icon={<Bot className="h-8 w-8" />}   // always h-8 w-8
  title="No agents yet"
  description="Create your first agent to get started"
  action={<Button size="sm" onClick={onCreate}>New Agent</Button>}
/>
```

### Connector Grid Pattern (3-column with correct computed borders)
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
  {CONNECTORS.map((c, i) => {
    const lgCol = i % 3;
    const lgRow = Math.floor(i / 3);
    const totalRows = Math.ceil(CONNECTORS.length / 3);
    const smCol = i % 2;
    const smRow = Math.floor(i / 2);
    const smTotalRows = Math.ceil(CONNECTORS.length / 2);
    return (
      <div
        key={c.key}
        className={cn(
          'p-4 border-b border-border/50 last:border-b-0',
          smCol < 1 && 'sm:border-r sm:border-border/50',
          smRow >= smTotalRows - 1 && 'sm:border-b-0',
          smRow < smTotalRows - 1 && 'sm:border-b sm:border-border/50',
          lgCol < 2 ? 'lg:border-r lg:border-border/50' : 'lg:border-r-0',
          lgRow < totalRows - 1 ? 'lg:border-b lg:border-border/50' : 'lg:border-b-0',
        )}
      />
    );
  })}
</div>
```

---

## 6. Anti-Patterns Table

| Anti-Pattern | Correct |
|---|---|
| `<h2 className="text-sm font-medium mb-3">` inside `p-4` | Put heading in `px-4 py-3 border-b bg-muted/10` header bar |
| `text-lg` or `text-xl` on page h1 | `text-base font-semibold` |
| `space-y-5` as page outer wrapper | `space-y-6` |
| `p-5` on section card body | `p-4` |
| `h-2 w-2` status dot | `h-1.5 w-1.5 rounded-full` |
| `border-border/40` row divider | `border-border/50` |
| Missing `last:border-0` on table rows | Add `last:border-0` to every row div |
| `hover:bg-muted/20` row hover | `hover:bg-muted/10` |
| `rounded-lg` on card/section/dialog | `rounded-md` |
| Raw `<textarea>` | `<Textarea>` from `@/components/ui/textarea` |
| `<Button size="icon">` for page refresh | Raw `<button>` with `h-8 w-8` |
| `h-6 w-6` for EmptyState icons | `h-8 w-8` |
| `py-16` for empty state | `py-12` (with icon) or `py-8` (text only) |
| `text-sm` in table data cells | `text-xs` |
| `font-mono text-xs` for timestamps | `font-mono text-[10px] text-muted-foreground/50 tabular-nums` |
| Floating heading above bordered card | Heading inside card header bar (section card pattern) |
| `text-muted-foreground/60` in ColHeader | `text-muted-foreground` (no opacity in column headers) |
| Missing `cursor-pointer` on toggle buttons | Add `cursor-pointer` to all toggle buttons |
| `py-6` for inline empty state | `py-8` text-only, `py-12` with icon |
| Conditional border logic `i < arr.length - 1` on grid | Compute row/col and use responsive `border-r`/`border-b` classes |

---

## 7. File Locations Reference

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Dashboard shell: sidebar + header + `py-6 px-4 sm:px-6 max-w-5xl` wrapper |
| `src/app/(dashboard)/page.tsx` | Overview: metrics grid + activity chart + recent activity table |
| `src/app/(dashboard)/agents/page.tsx` | Agents list table |
| `src/app/(dashboard)/agents/[id]/page.tsx` | Agent detail: tabs (Overview, Chat, Memory, Config) |
| `src/app/(dashboard)/sessions/page.tsx` | Sessions table with expandable message thread |
| `src/app/(dashboard)/usage/page.tsx` | Usage: summary cards + chart + by-provider/agent tables |
| `src/app/(dashboard)/logs/page.tsx` | Logs: jobs table with expandable payload/error |
| `src/app/(dashboard)/queue/page.tsx` | Queue monitor: running/pending/failed sections |
| `src/app/(dashboard)/workflows/page.tsx` | Workflows: heartbeats + cron jobs with section card pattern |
| `src/app/(dashboard)/skills/page.tsx` | Skills: table with expandable trigger editor |
| `src/app/(dashboard)/settings/page.tsx` | Settings: orchestrator + bots + webhooks + accounts + health |
| `src/app/(dashboard)/settings/_sections/health-section.tsx` | System health + security + platform connectors grid |
| `src/app/(dashboard)/settings/_sections/accounts-section.tsx` | LLM accounts management |
| `src/app/(dashboard)/settings/_sections/bots-section.tsx` | Bot instances management |
| `src/app/(dashboard)/settings/_sections/webhooks-section.tsx` | Webhook management |
| `src/app/(dashboard)/settings/_sections/orchestrator-section.tsx` | Orchestrator + agent configs |
| `src/app/(dashboard)/chat/page.tsx` | Chat: agent selector sidebar + chat panel |
| `src/components/ui/dialog.tsx` | Dialog: `rounded-md border`, header `px-5 py-4`, body `px-5 py-5` |
| `src/components/ui/button.tsx` | Button variants; `size="icon"` = `h-9 w-9` (do not use for page refresh) |
| `src/components/ui/textarea.tsx` | Textarea component — always use this, never raw `<textarea>` |
| `src/components/ui/empty-state.tsx` | EmptyState: `py-12` default, icon `h-8 w-8` |
| `src/components/dashboard/activity-chart.tsx` | Activity chart with section card header (title + label badge) |
| `src/components/layout/app-sidebar.tsx` | Desktop `hidden lg:flex` + mobile overlay drawer |
| `src/components/layout/site-header.tsx` | `h-14`, breadcrumb, search, refresh, user dropdown |
| `src/lib/status.ts` | `STATUS_DOT` and `STATUS_TEXT` maps for consistent status styling |

---

## 8. Design Tokens Quick Reference

```
Background:   #000000  (pitch black)
Border:       #1a1a1f
Primary:      #8B5CF6  (purple)
Muted bg:     #0c0c0e

Status colors:
  ok / running:   bg-emerald-500
  warn / paused:  bg-yellow-500
  error / failed: bg-red-500
  off / stopped:  bg-muted-foreground/30

Status dot size: h-1.5 w-1.5 rounded-full  (NEVER h-2 w-2)

Key class combos:
  section-header:  px-4 py-3 border-b border-border bg-muted/10
  table-header:    px-4 py-2.5 bg-muted/20 border-b border-border
  table-row:       px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors
  card-body:       p-4
  dialog-header:   px-5 py-4
  dialog-body:     px-5 py-5
  page-wrapper:    space-y-6
```

---

## 9. Pre-commit Checklist

Run through this before shipping a new page or component:

- [ ] Outer wrapper uses `space-y-6`
- [ ] Page h1 uses `text-base font-semibold`
- [ ] Page subtitle uses `text-sm text-muted-foreground mt-0.5`
- [ ] Every named section uses Section Card Pattern (heading inside `px-4 py-3 border-b bg-muted/10`)
- [ ] No floating `<h2 ... mb-3>` inside `p-4` cards
- [ ] Section body is `p-4` (not `p-5` or `p-3`)
- [ ] All containers are `rounded-md` (not `rounded-lg`)
- [ ] Table column header row inside `overflow-x-auto > min-w` wrapper
- [ ] Table column header uses `px-4 py-2.5 bg-muted/20`
- [ ] Table data rows use `border-border/50 last:border-0 hover:bg-muted/10`
- [ ] All table cell text is `text-xs` (never `text-sm`)
- [ ] ColHeader uses `text-[10px] font-medium text-muted-foreground uppercase tracking-wider`
- [ ] Status dots are `h-1.5 w-1.5` (never `h-2 w-2`)
- [ ] Inline empties: `py-12` with icon, `py-8` text-only
- [ ] EmptyState icons are `h-8 w-8` (not `h-6 w-6`)
- [ ] Page refresh uses raw `<button>` `h-8 w-8` (not `<Button size="icon">`)
- [ ] All Textarea fields use `<Textarea>` component (not raw `<textarea>`)
- [ ] Toggle buttons have `cursor-pointer`
- [ ] Timestamps use `font-mono text-[10px] text-muted-foreground/50 tabular-nums`
- [ ] Row dividers use `border-border/50` (never `/40`)
- [ ] Metric values use `font-pixel text-3xl tabular-nums leading-none`
