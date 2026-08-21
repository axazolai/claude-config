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

- Extract first: pull literal values out of the reference — spacing, sizes, exact colors, radii,
  borders, shadows, font family/size/weight/line-height/letter-spacing, icon set, z-order,
  breakpoints — into the project's tokens or theme, then implement against those tokens.
- Copy values verbatim: `13px` stays `13px`, `#1B1F24` stays `#1B1F24`. No rounding to a 4/8pt
  grid, no snapping to an existing token, no tidier scale.
- Bend the library to the reference: MUI `createTheme` + `styleOverrides`, shadcn/ui CSS
  variables and component edits, Tailwind `theme.extend`, Compose/SwiftUI custom themes.
- Take a library component for behavior-heavy elements (dialog, menu, select, autocomplete,
  table, date picker, form control) and for anything repeated across screens. A one-off box,
  stack, or text line is plain markup + tokens.
- Fidelity of style and markup is the gate on that choice: drive the component through
  `sx` / `slotProps` / `styleOverrides` / `className` and its structural props; when its DOM or
  visuals still cannot match, rebuild the element by hand.
- Follow the reference's structure: same element order, nesting, grouping, responsive behavior.
  Never re-flow the layout into what the library makes easy.
- Ship the specified fonts, weights, and icon set as assets. A substitute or a missing asset is
  asked about, never chosen.
- Declare gaps: implement what the reference shows; for what it omits (hover/focus/disabled/
  loading/empty/error states, uncovered breakpoints, absent elements) extend its visual language
  and list every improvised piece in the reply.
- Before claiming done, compare the rendered result to the reference region by region (screenshot
  the running UI when a browser tool is available) and report the remaining diffs.
- Avoid: adapting the design to the design system, taking a library component that saves no
  boilerplate and then bending the design to its defaults, keeping one whose DOM cannot be driven
  to the reference, redesigning while implementing, dropping detail as "minor" (a shadow, a 1px
  border, letter-spacing), approximating a color with the nearest palette entry, substituting
  fonts or icon sets, silently omitting states the reference shows, calling a screen done without
  comparing it to the reference.
