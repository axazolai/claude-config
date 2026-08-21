---
paths:
  - "**/*.{jsx,tsx,vue,svelte}"
  - "**/*.{css,scss,sass,less,styl}"
  - "**/*.{xaml,swift,kt,dart}"
  - "**/tailwind.config.*"
  - "**/theme.{ts,tsx,js,jsx}"
  - "**/tokens.{ts,js,json,css}"
---

# Design fidelity (cross-cutting)

Active whenever the work ships against a supplied design: mockup, screenshot, Figma frame or
export, PDF, a live page to match, or a reference implementation.

- Extract before coding. Pull the literal values out of the reference — spacing, sizes, exact
  colors (hex/rgba), radii, borders, shadows, font family/size/weight/line-height/letter-spacing,
  icon set, z-order, breakpoints — into the project's tokens or theme, then implement against
  those tokens.
- Copy values verbatim: `13px` stays `13px`, `#1B1F24` stays `#1B1F24`. No rounding to a 4/8pt
  grid, no snapping to the nearest existing token, no tidier scale.
- The component library bends to the reference: MUI `createTheme` + `styleOverrides`, shadcn/ui
  CSS variables and component edits, Tailwind `theme.extend`, Compose/SwiftUI custom themes.
- Pick library components on payoff, not on habit: take them for behavior-heavy elements
  (dialog, menu, select, autocomplete, table, date picker, form control — focus traps, portals,
  keyboard and ARIA wiring) and for anything repeated across screens. A one-off box, stack or
  text line is plain markup + tokens; wrapping it in a library component and then fighting its
  defaults costs more than it saves.
- Fidelity of style and markup is the acceptance gate on that choice. Drive the chosen component
  to the reference through `sx` / `slotProps` / `styleOverrides` / `className` and its structural
  props; when its rendered DOM or visuals still cannot match (imposed wrappers, unstyleable
  pseudo-elements, fixed internal layout), rebuild the element by hand.
- Structure follows the reference: same element order, nesting, grouping and responsive
  behavior as shown. Never re-flow the layout into what the library makes easy.
- Fonts and icons: ship the specified family, weights and icon set as assets; a system-stack or
  another-icon-pack substitute is asked about, not chosen. Missing asset → ask.
- Gaps are declared: implement what the reference shows; for what it omits (hover/focus/
  disabled/loading/empty/error states, uncovered breakpoints, elements it never contains)
  extend its visual language and list every improvised piece in the reply.
- Verify before claiming done: compare the rendered result against the reference region by
  region (screenshot the running UI when a browser tool is available) and report remaining
  diffs instead of intent.
- Avoid: adapting the design to the design system, taking a library component that saves no
  boilerplate and then bending the design to its defaults, keeping one whose DOM or visuals
  cannot be driven to the reference, redesigning while implementing, dropping detail as "minor"
  (a shadow, a 1px border, letter-spacing), approximating a color with the nearest palette
  entry, substituting fonts or icon sets, silently omitting states the reference shows, calling
  a screen done without comparing it to the reference.
