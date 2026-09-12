# Solo maintenance refactor roadmap

Date: 2026-09-12
Status: proposed roadmap for discussion; implementation has not started.

## Goal and decisions

The maintainer's confirmed priority is to understand the code more easily and add features with less context switching.

Two questions remain open: which features come next, and whether upstream changes will be merged regularly. This draft assumes incremental independent development, while preserving behavior, saved data, the userscript format, Bun, TypeScript, and the current DOM UI. These are proposed defaults, not confirmed answers.

This is an architectural roadmap, not a task-by-task implementation specification. Write the detailed execution plan for one stage at a time after its boundaries are agreed. Every stage must leave a usable userscript.

## What the current code shows

| Area | Evidence | Maintenance cost |
| --- | --- | --- |
| Application coordination | `src/bot.ts` has 931 lines; `draw()` occupies lines 227–484. The class also initializes the app, intercepts fetch, synchronizes templates, buys resources, and schedules runs. | Drawing changes require understanding UI, account state, timing, and site integration together. |
| Image ownership | `src/image.ts` has 913 lines. Its constructor at line 191 takes a long positional argument list. `updatePixels()` at line 550 sends work, applies results, paints the overlay, and refreshes UI. | A setting spans construction, loading, saving, worker requests, and several event handlers. |
| Dependency direction | `src/worker.ts:10` imports `UnownedColorStrategy` from `image.ts`; drawing enums live in `widget.ts`. | Domain concepts belong to UI modules. This is an ownership problem even when the bundler removes unused UI code. |
| Persistent data | `src/save.ts:114` derives save types from UI class methods and migrates `any`. `BotImage.toJSON()` at line 479 encodes the source image on each serialization. | Persistent contracts and runtime UI representation evolve together. |
| Import side effects | `bot.ts` constructs the singleton at module scope; `save.ts` opens IndexedDB; `worker-client.ts` constructs a worker; `map.ts` starts an observer. | Importing application modules is difficult outside a live page. |
| Site coupling | `map.ts` discovers the live map from app chunks. `WorldPosition` receives a whole bot to use its map. Fetch interception and DOM actions remain in `bot.ts`. | Changes to wplace are mixed with application behavior. |
| Tests and delivery | 48 tests cover five files. The only workflow, `.github/workflows/build.yml`, publishes the committed artifact on tags. | There is no automatic check of source changes or artifact freshness before release. |
| Maintainer guidance | `AGENTS.md` still documents fake favorite markers and `bun start`; current code uses the map's projection and `bun run build`. The existing graph also contains removed marker methods. | Both the human maintainer and coding agents can start from a wrong architecture description. |

References describe the inspected checkout; line numbers will move during implementation. The existing graph was used only as an initial map because it is stale. Findings above were checked against source.

## Map positioning research carried into this plan

Required reference: [Map positioning research](map-positioning-research.md), recorded on 2026-09-09. Read it before stages 0, 3, 4 and 5: it explains the original anchor workaround, the measured replacement, and the interaction constraints that the extraction must preserve.

The research describes the checkout at the time of the experiment. Its references to "current" star positioning, old line numbers, chunk hashes and export names are historical. Live measurements are evidence from that session, not a guarantee about later versions of wplace. Do not repeat the already completed migration as new work.

| Research conclusion | Current baseline and remaining work |
| --- | --- |
| Use the site's existing MapLibre map instead of measuring favorite markers. | Already implemented in `map.ts` and `world-position.ts`. Extract this implementation into the site boundary; keep favorite injection and marker parsing removed. |
| Discover the state store through loaded app chunks without hardcoded hashes or export names. | Already implemented. Preserve the current `PerformanceObserver` collection, which also handles resource entries arriving after startup; do not replace it with the research's one-time resource scan. |
| Use `project()`/`unproject()` and the existing Mercator conversions. | Already implemented for the current canvas layout. Make viewport versus canvas-local coordinates explicit and cover a nonzero canvas rectangle offset. |
| Compute pixel size as `512 * 2 ** zoom / 2048000`. | Already implemented and tested, with the inverse zoom helper. Preserve the world size and numerical results. A scalar size alone does not prove rotated or tilted overlay alignment. |
| Move the camera through its API and redraw on map events. | Already implemented using camera methods and `move`/`resize` listeners. Preserve this; define subscription cleanup when extracting lifecycle ownership. |
| A secondary map-discovery technique was demonstrated using canvas context and map-render hooks. | Keep it documented as a contingency. Do not introduce prototype hooks into the refactor without evidence that the current discovery fails. |

The research's input-event observations are preservation constraints for stages 4–5: retain the existing pixel-staging interaction and API-based camera movement; do not replace them with synthetic canvas clicks, pointerdown or touchstart. Keep site-button actions distinct from map-canvas actions. Treat the recorded detection behavior as dated observations, not a promise of safety. Reading the store for map discovery does not authorize changing its detection state. A proposed detection-status widget is a separate optional feature, outside this refactor.

## Options

1. **Incremental extraction around data and feature flows — recommended.** Introduce explicit data contracts, isolate processing, then separate image UI and drawing coordination. Moderate effort, with useful stopping points.
2. **Small cleanup only.** Replace positional arguments and refresh documentation. Cheapest first step, but leaves most cross-module dependencies intact. Suitable if substantial upstream merges are frequent.
3. **Full rewrite or UI framework migration.** Rebuild ownership and UI together. Largest validation burden; there is no evidence that changing the framework is needed for the confirmed goal.

## Proposed boundaries

Keep related files together when they are extracted. Do not move every existing file merely for folder consistency.

| Boundary | Responsibility | Must not own |
| --- | --- | --- |
| `src/image/model.ts` | Image settings, defaults, plain state, color policy and statistics types | DOM, IndexedDB, the whole bot |
| `src/image/controller.ts` | Apply setting changes, request calculations, discard obsolete results, notify the view, request saves | Palette algorithms or site selectors |
| `src/image/view.ts` | Image controls, overlay rendering, dragging and resizing | Save format or worker protocol |
| `src/processing/pipeline.ts` | Scale, quantize, compare against supplied tile data, apply existing ordering passes | DOM, fetching, worker globals |
| `src/processing/tile-cache.ts` | Fetch and decode tiles, cache ownership and invalidation | Image controls |
| `src/processing/protocol.ts` | Request, result, progress and error messages | UI classes |
| `src/persistence/schema.ts` and `migrations.ts` | Explicit serialized shapes, validation and version conversion | Runtime image construction |
| `src/persistence/store.ts` | IndexedDB operations and save scheduling | DOM or serialization of view objects |
| `src/site/` | Map discovery/projection, account observation, site controls and template storage access | Scheduling decisions or image settings |
| `src/drawing/policy.ts` and `runner.ts` | Choose work and coordinate a run using narrow dependencies | Hardcoded DOM selectors |
| `src/main.ts` | Install early observers, construct components, connect callbacks, start the app | Processing algorithms |

Use ordinary functions, small objects and explicit callbacks. Add interfaces only at real boundaries such as a worker, storage, the site, or time. Keep `WPlaceBot` as a compatibility facade while extracting responsibilities; preserve the `globalThis.wbot` entry point until its uses are checked.

## Stage 0 — Establish a trustworthy baseline

Modify `package.json`, `AGENTS.md`, `README.md`, `src/build.ts`; add a check workflow and a short manual smoke checklist.

- Document the current map integration, actual commands, five existing test files, and the ownership of the shipped artifact.
- Link the positioning research from the maintainer guidance and distinguish its historical migration steps from the completed map integration. Add the positioning checks below to the manual baseline before moving overlay or camera code.
- Separate non-mutating checks from autofix: `check` should run stylelint, eslint, TypeScript and tests without changing source. Keep a separately named fix command.
- Check both Bun build results explicitly before reading outputs. Check the worker placeholder occurs exactly once and is removed in the assembled artifact.
- In CI, check source and build the full userscript, including worker embedding and banner. Verify that the generated artifact agrees with the committed artifact.
- Capture representative small inputs and outputs for processing and saving before extracting those parts. Add each fixture with the stage that consumes it; avoid a large snapshot dump of the UI.
- For an independently published fork, review installation, update, homepage and support URLs: `script.txt` and README currently point to `SoundOfTheSky/wplace-bot`. Choose the fork's actual distribution address before editing these fields; preserve attribution.

Acceptance: one documented command checks the project without fixing it; the full release artifact is checked automatically; the manual checklist covers import, settings, drag/resize, manual draw, auto-draw, reload and export.

## Stage 1 — Make image and save contracts explicit

Create `src/image/model.ts`, `src/persistence/schema.ts`, `src/persistence/migrations.ts`, `src/processing/protocol.ts`, and `src/drawing/policy.ts`. Modify `image.ts`, `widget.ts`, `worker.ts`, `worker-client.ts`, `save.ts`, and `wplace-file.ts` at their type/default boundaries.

- Move image policies and statistics out of UI modules; move drawing policy enums out of `widget.ts`.
- Define independent image settings and saved-image/saved-bot types. Keep runtime sets and arrays separate from serialized representations.
- Replace the positional image constructor with a named options object. Put creation defaults in one function, with migration-specific defaults kept explicit.
- Remove `ReturnType<BotImage['toJSON']>` and `ReturnType<WPlaceBot['toJSON']>` as the source of persistent contracts.
- Move migration functions out of the module that opens IndexedDB. Preserve existing serialized field names, enum values and position tuples. A structural refactor alone does not require a save version bump.
- Keep the `.wplace` codec separate from reading the site's template storage. Export should consume plain data rather than a `BotImage` instance.

Acceptance: tests can import settings, migrations and protocol without constructing a worker, opening IndexedDB or touching DOM. Supported legacy inputs retain defaults, positions, disabled/site-disabled distinctions and ordering choices after load/export/load.

## Stage 2 — Extract the pixel calculation pipeline

Create `src/processing/pipeline.ts`, `src/processing/tile-cache.ts` and pipeline tests. Modify `src/worker.ts`; retain `colors.ts` and `ordering.ts` as the existing algorithm modules initially.

- Extract `pixels()` into a function that consumes a request and tile data and returns pixel indices, task coordinates and color statistics.
- Keep worker message routing, progress messages, transfers and tile loading outside that function.
- Preserve scaling, alpha threshold, metrics, substitution, skipped-color statistics and ordering precedence: base sweep/contrast, region pass, color pass, outline pass.
- Preserve typed buffers and transfer ownership; do not introduce object allocation per pixel as part of extraction.
- Add tests for a small image spanning a tile boundary, transparency, unavailable colors, skipped colors, and combined ordering passes. Compare old and extracted results on fixed inputs before switching the worker.

Acceptance: the pipeline runs under `bun test` without browser globals or live requests; a new pixel-processing option can be implemented and verified without loading the UI. Record before/after time and buffer sizes on the same representative image to catch a material regression.

## Stage 3 — Separate image state changes from UI

Create `src/image/controller.ts` and `src/image/view.ts`; extract settings and overlay helpers only when they form substantial independent pieces. Modify `src/image.ts`, `src/widget.ts`, and HTML bindings.

- First keep `BotImage` as a facade, delegating one responsibility at a time.
- Route setting changes through a single controller operation. It chooses whether to render only, rebuild tasks, recompute pixels, or save.
- Establish which fields affect which calculation before implementing partial recomputation. Changing opacity or a name must not invoke color matching; a position change must refresh map comparison without assuming the old tile data is valid.
- Give each asynchronous recalculation a revision; only the current revision may update the view/state. Disposal invalidates pending results.
- Keep image source encoding separate from serializing small settings; reuse encoded source data until the source itself changes, with export compatibility tests.
- Give listeners, timers and object URLs an explicit owner and cleanup point.
- Preserve the research-backed map projection when extracting the overlay view. Cover pan, zoom and resize; route canvas/viewport conversion through the site boundary instead of duplicating offset arithmetic in drag handlers.

Acceptance: a setting has one mutation path; obsolete worker results cannot overwrite newer settings or a deleted image; adding a setting no longer requires editing a positional argument chain. Existing overlay interactions pass the smoke checklist.

## Stage 4 — Isolate the site's integration points

Extract from `src/bot.ts`, `src/map.ts`, `src/world-position.ts`, and the site-storage portion of `src/wplace-file.ts` into focused `src/site/` modules.

- Read [the positioning research](map-positioning-research.md), especially sections 2 and 4, and the baseline table above before changing the map boundary. This stage extracts the completed migration rather than reintroducing its predecessor or implementing its fallback by default.
- Separate map discovery and camera projection from plain world/tile coordinate calculations. Pass only the map operations a consumer needs.
- Define projection inputs/outputs explicitly: map-local CSS pixels versus viewport CSS pixels, world pixel corners versus centers. Convert viewport points by the canvas bounding rectangle before `unproject()` and apply the rectangle offset after `project()` where viewport coordinates are required. Cover offset corrections as a separate tested behavior change if the baseline fails.
- Preserve API-based pan/zoom, resource observation, map-readiness timeout and event-driven redraw. Pair installed observers/listeners with cleanup using the actual map API; verify its subscription/removal contract rather than assuming a return shape.
- Give fetch interception an explicit install/dispose lifecycle. Install required observation early enough for `document-start`; do not delay it behind image loading or UI setup during bootstrap extraction.
- Group account/paint response parsing and DOM controls by their site responsibility. Let adapters report data/errors; let UI decide how to display failures.
- Separate reading site templates from reconciling them with the bot's image list. Preserve the distinction between the site's visibility and the user's visibility switch.
- Keep the current integration mechanism during extraction. Changing how the map is discovered would be a separate behavior change.

Acceptance: drawing coordination and image state code contain no wplace selectors or app-chunk discovery. Fixture tests cover response parsing and template reconciliation; a live smoke check verifies the current site integration.

Positioning acceptance checks, derived from the research:

- Extend `src/world-position.test.ts` with viewport/canvas conversion tests through a fake map: a zero-offset canvas, a nonzero offset, and forward/inverse round trips. Retain the existing world-coordinate and zoom tests.
- Verify a selected world pixel's projected center resolves to the same tile/local pixel in the site's pixel-inspection response during an explicitly authorized live interaction. Revalidate the measurement; do not reuse the research's screen position as a fixture for another viewport.
- Check overlay alignment and dragging after pan, zoom and viewport resize. Confirm the implementation uses CSS pixels consistently on the tested display scale.
- Exercise nonzero bearing and pitch where available. Check both overlay geometry and pixel-center targeting: `project()` being correct does not make an axis-aligned canvas or a scalar half-pixel screen offset correct. If the baseline fails, record it as a separate positioning fix with an explicit support decision before claiming those views work.
- Verify that camera operations call map methods and do not dispatch synthetic canvas input events. Preserve the existing staging event sequence in runner tests.
- Check cold-load discovery, chunks observed after startup, missing-map timeout, and disposal without leftover map listeners. A missing map must produce an integration error, not a save-reset recommendation.

## Stage 5 — Extract drawing decisions and run coordination

Create `src/drawing/runner.ts`; extend `src/drawing/policy.ts`; extract from `WPlaceBot.draw()`, `autoDraw()` and related account decisions. Keep dependencies explicit: site operations, image task data, clock/wait functions, and progress callbacks.

- First extract pure decisions: which image supplies the next task, how charges are distributed, purchase eligibility, and next wake-up time.
- Then extract the run lifecycle: prepare, queue, optionally submit, reconcile, finish. Use explicit state and one cleanup path.
- Preserve the current distinction: manual Draw stages the queue; Auto-Draw submits it. Only confirmed painting advances completed work/account counters.
- Carry the positioning research constraints through the runner/site interface: camera movement remains API-based, staging retains its current event sequence, and pixel-center projection belongs to the site coordinate adapter. Do not duplicate `pixelSize / 2` screen arithmetic in the new runner without the positioning checks above.
- Preserve all three image strategies and existing purchase policy values during extraction. Investigate suspected policy defects separately rather than silently changing outputs.
- Test with a fake site and clock: insufficient charges, no work, hidden images, a rejected or partial paint response, an account update during submission, and a failure during a run. None of these tests should spend resources on the live site.

Acceptance: drawing can be exercised without DOM or a real account; the widget renders progress and sends commands without owning the scheduling loop; existing behavior passes the manual checklist.

## Stage 6 — Finish the ownership cleanup

Create `src/main.ts`; simplify the remaining facade and update `src/build.ts`, documentation and the project graph.

- Move application startup to one entry point and remove import-time side effects from reusable modules.
- Keep algorithm files intact unless a concrete feature requires a further split. File length by itself is not an acceptance criterion.
- Remove obsolete code and exports only after checking references. Update the source map in `AGENTS.md` and add a short guide: where to add an image option, ordering strategy, site compatibility fix, or migration.
- Regenerate the graph after the new boundaries settle; exclude generated bundle noise from source-architecture interpretation.

Acceptance: the worker and pure code do not depend on UI modules; modules can be understood from their inputs/outputs; full checks and the assembled artifact pass; documentation describes the actual checkout.

## Separate correctness follow-ups

These are source-level observations, not reproduced browser failures. Add focused regression tests and fix them in separate changes when touching their owner:

- `save.ts:80`: clearing the shared debounce timeout leaves the previous returned promise without a completion path. Define whether every caller waits for the eventual flush or whether scheduling is explicitly fire-and-forget; implement and test that contract.
- `worker-client.ts:26`: an error response rejects without deleting its pending entry; global worker errors only log. Define completion/rejection for outstanding requests and test cleanup and subsequent requests.
- `image.ts:550`: awaited results are applied without a revision/disposal guard. Test out-of-order results with a fake worker before adding the guard.
- `bot.ts:184`: the initialization catch offers data deletion for failures across the entire initialization sequence. `save.ts:67` also turns load errors into an absent save. Distinguish storage, site and image failures so recovery acts on the actual failing component.

## Order, scope and stopping points

Default order: 0 → 1 → 2 → 3 → 4 → 5 → 6. Stages 0–3 are the first useful milestone for the confirmed goal. Reassess after that milestone using one real feature: note which files it touches and why.

If image processing features are next, keep this order. If automation/multiple-image features are next, prioritize 4–5 after 1 and the minimum pipeline boundary needed by runner tests. If frequent upstream merges are required, begin with 0–1 and make subsequent extractions smaller to limit merge conflicts.

Do not add a framework, generic event bus, dependency-injection container, plugin API, or new backend without a concrete requirement. Do not rewrite the algorithms while moving them. Do not commit/push or start implementation as part of this planning task. Use jj for future working-copy/history changes in this colocated repository.

## Verification performed for this review

- `bun test`: 48 passed, 0 failed across five files.
- `bun ./node_modules/typescript/bin/tsc --noEmit --composite false --incremental false`: passed. The overrides avoid writing compiler state; this is a source type check, not validation of the configured composite build mode.
- In-memory Bun builds of `src/bot.ts` and `src/worker.ts`: both succeeded. Full userscript stitching, installation and live painting were not tested in this review.
- The lint autofix command was not run. Source, save data, and `dist.user.js` were not changed by this review.
