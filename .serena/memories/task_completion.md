# Task completion

1. `bun run check` must pass (stylelint, eslint, tsc, bun test).
2. If `src/` changed anything that ends up in the bundle: `bun run build`, then `bun run build:check` must pass; `dist.user.js` is committed with the change.
3. DOM-dependent change: tell the user it needs the manual smoke check (`docs/manual-smoke-check.md`) in Tampermonkey on wplace.live; live painting needs their explicit authorization.
4. Update `CLAUDE.md` if architecture or commands changed.
5. Commit with jj; the user pushes.
