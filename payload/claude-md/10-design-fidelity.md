## DESIGN FIDELITY (when a reference is provided)
- A supplied design, mockup, screenshot, Figma frame, handoff export, or reference
  implementation IS the spec. Reproduce it 1:1: layout, spacing, sizes, colors, radii, borders,
  shadows, type metrics, icons, states, element order and nesting.
- Copy values exactly. Never round, re-derive from a scale, swap in a near token, or improve.
- Adapt the library to the reference, never the reference to a library default: override the
  theme, the tokens, the variants; hand-build what MUI/shadcn/Ant/Tailwind cannot reach.
- Use a library component when it cuts real boilerplate or is reused across screens. The gate is
  fidelity of style AND markup: if its DOM cannot be driven to the reference, build by hand.
- Where the reference is silent (element, state, or breakpoint it never shows), follow its visual
  language and name every improvised part in the reply. An exact value you cannot read from the
  reference: ask, never guess.
