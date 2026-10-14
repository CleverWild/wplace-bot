# wplace-bot core

Tampermonkey userscript automating pixel painting on wplace.live. No own backend; drives wplace's DOM and intercepts its API. Shipped artifact: committed `dist.user.js`.

- Authoritative architecture/conventions doc: `CLAUDE.md` in repo root (module-by-module map). `AGENTS.md` is an older Codex copy and is partly stale (e.g. `BotImage` ctor is `(bot, siteTemplate, options)` in CLAUDE.md). Trust CLAUDE.md.
- Source layout: `src/` flat modules (`bot.ts` singleton `WPlaceBot`, `map.ts`, `world-position.ts`, `ordering.ts`, `flags.ts`, `colors.ts`, `save.ts`, `widget.ts`, `image.ts`) plus dirs `image/`, `drawing/`, `processing/`, `persistence/`, `site/`.
- Worker constraint: `src/worker.ts` is bundled separately and inlined as a Blob string. Anything it needs must be in its own import graph; no runtime imports from DOM modules.
- DOM-free modules have `*.test.ts`; DOM code is verified by hand via `docs/manual-smoke-check.md`.
- Never dispatch `click`/`pointerdown`/`touchstart` at the map canvas (wplace flags automation). Use `mousemove` + space.
- VCS is jj (colocated with git), not plain git. User runs `git push` themselves.

Further reading:
- Tooling, build, test, lint commands: `mem:suggested_commands`
- What to run before declaring a task done: `mem:task_completion`
- Code style and hot-path rules: `mem:conventions`
- Language/toolchain versions: `mem:tech_stack`
