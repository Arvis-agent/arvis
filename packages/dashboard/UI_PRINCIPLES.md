# Arvis Dashboard — UI Principles

Authoritative reference for all dashboard UI development. Every component, page, and pattern must follow these rules.

---

## 1. Design Tokens — Single Source of Truth

All colors, spacing, and typography are defined in `globals.css` via CSS custom properties. **Never hardcode values.**

```
Background:       var(--color-background)         #000000
Card:             var(--color-card)                #09090b
Primary:          var(--color-primary)             #8B5CF6
Foreground:       var(--color-foreground)          #e4e4e7
Muted foreground: var(--color-muted-foreground)    #63636e
Border:           var(--color-border)              #1a1a1f
Muted bg:         var(--color-muted)               #0c0c0e
Accent:           var(--color-accent)              #111113
Destructive:      var(--color-destructive)         #dc2626
```

**Rule: Use Tailwind semantic classes (`bg-background`, `text-foreground`, `border-border`) — never raw hex in components.**

Exception: Recharts SVG requires hex strings directly (SVG can't resolve CSS vars).

---

## 2. No Hardcoded Values

| Instead of | Use |
|-----------|-----|
| `#000000` in JSX | `bg-background` |
| `#8B5CF6` in JSX | `bg-primary` / `text-primary` |
| `#1a1a1f` in JSX | `border-border` |
| `color: #63636e` | `text-muted-foreground` |
| `w-[200px]` for layout | Responsive classes (`w-full md:w-[200px]`) |
| `h-[520px]` for containers | `flex-1 min-h-0` (flex-based sizing) |
| Fixed pixel breakpoints | Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) |
| Inline `style={{}}` | Tailwind classes (inline styles can't be overridden) |

---

## 3. Component Consistency

### Border style
All inputs, textareas, selects use the same pattern:
```
border border-border focus-visible:border-primary/50
```
Never use `border-input` or `ring-ring` — these are Radix leftovers.

### Disabled state
```
disabled:opacity-40 disabled:cursor-not-allowed
```
Never use `disabled:pointer-events-none` — it breaks tooltips and cursor feedback.

### Loading states
Always use `<Skeleton>` component. Never use plain "Loading..." text.

### Error states
Every data-fetching component must handle fetch failure with a visible error + retry button. Never show infinite skeleton on error.

### Border radius
Cards and containers: `rounded-md` (6px). Never `rounded-lg` or `rounded-xl`.

### Status dots
`h-1.5 w-1.5 rounded-full` — never `h-2 w-2`.

---

## 4. Accessibility (Non-Negotiable)

### Dialogs
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- Focus trap (Tab cycles within dialog)
- Escape key closes
- Body scroll locked
- Focus returns to trigger on close

### Dropdowns / Menus
- `role="menu"` on container, `role="menuitem"` on items
- `aria-expanded` + `aria-haspopup` on trigger
- Arrow key navigation (up/down cycle, Escape closes)
- Focus first item on open

### Select / Listbox
- `role="listbox"` on dropdown, `role="option"` on items
- `aria-selected` on active option
- `aria-expanded` + `aria-haspopup="listbox"` on trigger

### Forms
- Every input has a `<label>` (use `sr-only` if visually hidden)
- Error messages have `role="alert"` or `aria-live="polite"`
- Use `aria-describedby` to link inputs to their error messages

### Toasts
- Container has `aria-live="polite"` + `aria-relevant="additions removals"`
- Dismiss buttons have `aria-label`

### Icons
- Decorative icons: `aria-hidden="true"` on SVG
- Functional icons (buttons with only icon): parent button needs `aria-label`

### Keyboard
- All interactive elements are focusable and operable via keyboard
- Focus indicators visible (`:focus-visible` outline, never removed globally)
- Tab order follows visual order

---

## 5. Responsive Design

### Mobile-first approach
- Sidebar: hidden on mobile, drawer overlay on tap
- Fixed-width sidebars: `hidden md:flex md:w-[200px]`
- Content width: `max-w-5xl` for most pages, full width for chat
- Tables: horizontal scroll wrapper on small screens
- Grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`

### Touch targets
Minimum 44x44px for interactive elements on mobile (use `min-h-11 min-w-11`).

---

## 6. Data Fetching Patterns

### Client-side fetches must always:
1. Check `r.ok` before calling `r.json()`
2. Validate response shape before setting state
3. Handle errors with user-visible feedback
4. Use `Promise.allSettled` for parallel independent fetches (not `Promise.all`)

```tsx
// GOOD
fetch('/api/data')
  .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
  .then((data) => { if (Array.isArray(data)) setItems(data); })
  .catch(() => toast.error('Failed to load'));

// BAD — silent garbage state on error
fetch('/api/data').then((r) => r.json()).then(setItems).catch(() => {});
```

### State cleanup
- Revoke blob URLs when no longer needed (`URL.revokeObjectURL`)
- Clear intervals/timeouts on unmount
- Abort in-flight fetches on unmount when possible

---

## 7. Security in Frontend Code

### Never expose secrets
- Bot tokens: mask in display (show last 4-6 chars)
- API keys: never send to frontend; mask on GET endpoints
- Passwords: add `password` to secret detection regex alongside `token/key/secret`
- Webhook secrets: mask on GET, only show full on initial create

### Never trust user-controlled paths
- Sanitize slugs: `/[^a-z0-9_-]/gi` → reject
- Verify resolved path stays inside expected directory
- Block internal IPs on fetch (SSRF protection)

### WebSocket
- Use `wss://` in production (auto-detect via `location.protocol`)
- Implement ping/keepalive to detect dead connections

### CSP
- `unsafe-eval` only in development, never in production
- Restrict `connect-src` to known WebSocket origins when possible

---

## 8. Animation & Motion

### Principles
- Animations serve function (entry, exit, state change) — never decoration
- All animations respect `prefers-reduced-motion`
- Use CSS keyframes for simple transitions, `requestAnimationFrame` for continuous effects
- Keep durations short: enter 150-250ms, exit 100-300ms

### Standard curves
```
Enter:  cubic-bezier(0.16, 1, 0.3, 1)   — spring-like overshoot
Exit:   cubic-bezier(0.4, 0, 1, 1)       — accelerate out
Linear: linear                            — spinners, shimmer
```

### Standard durations
```
Page enter:     200ms
Dropdown enter: 180ms
Dropdown exit:  160ms
Toast enter:    250ms
Toast exit:     300ms
Transitions:    150ms (default)
```

---

## 9. Typography

```
Page h1:       text-base font-semibold
Section header: text-xs font-medium uppercase tracking-widest text-muted-foreground
Table header:   text-xs font-medium text-muted-foreground
Table cell:     text-xs (never text-sm)
Metric value:   font-pixel text-3xl
Body text:      text-sm
Small text:     text-xs
Micro text:     text-[10px]
Code/monospace: font-mono text-xs
```

---

## 10. Component API Design

### Props
- Use union types for variants, not `string`: `variant?: 'default' | 'ghost' | 'outline'`
- Use `forwardRef` on all form elements (input, textarea, select, button)
- Spread `{...props}` last — but never after explicitly setting `onClick` (it overwrites)

### Shared constants
- `MODEL_OPTIONS`, `ROLE_OPTIONS` — define once in a shared constants file, never duplicate
- Type interfaces (`QueueJob`, etc.) — define once in shared types, never duplicate across pages

### State patterns
- Prefer `Set<number>` over `number | null` for multi-select/multi-action tracking
- Use `useCallback` deps correctly — never `eslint-disable` without a comment explaining why
- Controlled components: make `onValueChange` required when `value` is provided

---

## 11. Platform Awareness

- Keyboard shortcuts: detect OS via `navigator.userAgent` — show `⌘K` on Mac, `Ctrl+K` on Windows
- Never use `process.platform` in client components — it's a Node.js API
- File paths: use `navigator.platform` for Windows detection in client code

---

## 12. Git & Release

- Never add AI attribution to commits
- Version in `package.json` is the source of truth — derive displayed version from it
- Changelog: update on each release with categorized changes (Security, Fixed, Changed, Added)
