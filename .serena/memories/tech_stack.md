# Tech stack

- TypeScript, strict + `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`. Config extends `@softsky/configs/tsconfig.json`.
- Runtime/package manager/bundler/test runner: Bun only (pinned via `mise.toml`, `bun = latest`). No npm/node.
- Lint: eslint + stylelint + prettier, all configs from `@softsky/configs`.
- Deps: `@softsky/utils`; dev: `@types/bun`.
- Target: browser userscript (Tampermonkey) on wplace.live, which renders with MapLibre inside a SvelteKit app.
- Persistence: IndexedDB (`wbot`/`saves`), save schema versioned via `SAVE_VERSION`.
