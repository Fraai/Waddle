# Design tokens

Reference for the CSS custom properties defined in `src/styles/global.css`.
This documents what exists — it doesn't change any values. Tokens are plain
CSS variables on `:root`, redefined under `@media (prefers-color-scheme: dark)`.

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f5f7` | `#161618` | Page background |
| `--surface` | `#ffffff` | `#1f1f22` | Cards, lists, fields |
| `--chrome` | `rgba(250,250,252,.72)` | `rgba(30,30,34,.72)` | Blurred sidebar/header |
| `--hairline` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.1)` | Borders, dividers |
| `--row-hover` | `rgba(0,0,0,.028)` | `rgba(255,255,255,.045)` | Row hover background |
| `--pressed` | `rgba(0,0,0,.055)` | `rgba(255,255,255,.075)` | Active/pressed background |
| `--text` | `#1d1d1f` | `#f5f5f7` | Primary text |
| `--text-2` | `#6e6e73` | `#a1a1a6` | Secondary text |
| `--text-3` | `#8e8e93` | `#86868b` | Tertiary text, placeholders |
| `--accent` | `#0071e3` | `#0a84ff` | Links, focus, primary actions |
| `--accent-soft` | `rgba(0,113,227,.1)` | `rgba(10,132,255,.16)` | Accent-tinted backgrounds |
| `--danger` | `#ff3b30` | (same) | Destructive actions, overdue |
| `--p1`…`--p4` | `#ff3b30` `#ff9500` `#0a84ff` `#c3c3c7` | `--p4` → `#5a5a5f` | Priority ring colors (1 = urgent … 4 = none) |

`color-scheme: light dark` is set on `:root` so native form controls follow
the OS theme automatically.

## Spacing

4px base unit, named `--space-0-5` through `--space-7`:

| Token | Value |
|---|---|
| `--space-0-5` | 0.125rem (2px) |
| `--space-1` | 0.25rem (4px) |
| `--space-2` | 0.5rem (8px) |
| `--space-3` | 0.75rem (12px) |
| `--space-4` | 1rem (16px) |
| `--space-5` | 1.5rem (24px) |
| `--space-6` | 2rem (32px) |
| `--space-7` | 3rem (48px) |

Same steps as the Tailwind utility classes used in markup, so component CSS
and utility classes land on the same rhythm.

Derived: `--check-size` (1.25rem) and `--indent-subtask`
(`calc(var(--check-size) + var(--space-2))`) keep subtask rows aligned under
the parent checkbox rather than an arbitrary indent.

## Radius

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 7px | Buttons, fields, icon buttons |
| `--r-md` | 11px | Cards, task list, composer |
| `--r-lg` | 16px | (reserved, larger surfaces) |

## Shadow

| Token | Use |
|---|---|
| `--shadow-1` | Resting elevation (cards, composer, primary button) |
| `--shadow-2` | Lifted elevation (drag-sorting item) |

Dark mode swaps both to heavier, darker-alpha shadows since light-mode
shadow values read as invisible on dark surfaces.

## Motion

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--fast` | 120ms |
| `--med` | 220ms |

All transitions/animations in the stylesheet reference these two durations
and the one easing curve — no ad hoc timing values.

## Typography

No numeric type-scale tokens; two utility classes carry the two non-body
sizes used:

| Class | Size | Weight | Use |
|---|---|---|---|
| `.page-title` | 1.625rem | 700 | Page headings |
| `.label-caps` | 0.6875rem | 620 | Uppercase section labels |

Body text uses the system font stack (`-apple-system, BlinkMacSystemFont,
"SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif`) at the browser
default size; component styles set their own `font-size` inline where they
deviate (task rows, pills, fields, buttons — see `global.css` directly for
exact values, they're too fine-grained to usefully table here).

## Accessibility overrides

Three `prefers-*` media queries adjust tokens/behavior rather than being
separate token sets:

- `prefers-reduced-motion: reduce` — disables animations and press-scale transforms.
- `prefers-reduced-transparency: reduce` — swaps `--chrome` blur for solid `--surface`.
- `prefers-contrast: more` — darkens `--hairline`, `--text-2`, `--text-3` and drops the blur.

## Source of truth

`src/styles/global.css` is authoritative. This file is a reference, not a
duplicate — if the two disagree, the CSS wins and this doc is stale.
