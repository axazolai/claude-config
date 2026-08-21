## DESIGN FIDELITY (when a reference is provided)
- A supplied design, mockup, screenshot, Figma frame, handoff export, PDF, live page to
  match, or reference implementation IS the spec. Reproduce it 1:1: layout, spacing, sizes,
  colors, radii, borders, shadows, fonts, weights, line-heights, letter-spacing, icons,
  states, and the order and nesting of elements.
- Read every value out of the reference and write that exact value. Never round it, never
  re-derive it from a scale, never swap in a "close enough" token, never improve it.
- The project's component library or design system (MUI, shadcn/ui, Ant, Tailwind preset,
  the repo's own tokens) is adapted TO the reference — theme overrides, token overrides,
  restyled variants, custom components where the library cannot reach. Never adapt the
  reference to a library default: the reference outranks the house style.
- Reach for a library component when it cuts real boilerplate (dialog, menu, select, table,
  form controls, focus/portal/ARIA machinery) or makes a repeated element reusable — then
  override it to the reference. Fidelity of style AND markup is the gate on that choice: a
  component whose rendered DOM or visuals cannot be driven to match is replaced by hand-built
  markup.
- Deviate only where the reference is silent — an element it never shows, a state or
  breakpoint it does not cover. Then follow the reference's own visual language and name
  every improvised part in the reply.
- A value that must be exact and cannot be read from the reference is asked about, not guessed.
