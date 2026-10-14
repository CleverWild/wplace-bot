# Conventions

- Hot paths (`worker.ts`, `image.ts`, `bot.ts` draw loop): indexed `for`, `| 0` truncation, typed arrays, no allocation in loops.
- Non-null assertions on indexed access are the accepted idiom (`noUncheckedIndexedAccess`).
- Image settings change only through `image.update({...})`; new settings must be added to `SETTING_EFFECTS` in `image/controller.ts` (a `Record` type enforces it). Defaults live only in `createImageSettings` (`image/model.ts`).
- Serialized shape change => bump `SAVE_VERSION` and extend `migrate`/`migrateImage` in `persistence/migrations.ts`.
- UI markup/classes: build with `obfucsateHTML`; query with the selector helpers from `obfuscator.ts`, toggle with `addClass`/`removeClass`/`toggleClass`. In `style.css`, rules after `/** LOCAL STYLES */` get a random per-session prefix; earlier rules target wplace's own DOM raw.
- UI classes extend `Base` and use `registerEvent` (auto-removed on `destroy()`).
- Ordering passes are stable reorderings applied in sequence: base order, flood fill, color sort, outline-first. The last applied wins ties.
- wplace UI hooks (Tailwind class selectors, inline-SVG comparisons) break on site updates; first suspect when a click-driven feature stops working.
- Comments only for non-obvious business logic or workarounds.
