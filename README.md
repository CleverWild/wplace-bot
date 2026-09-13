# Wplace-bot

A fork of [SoundOfTheSky/wplace-bot](https://github.com/SoundOfTheSky/wplace-bot). Installing it over the original replaces it in Tampermonkey and keeps your saved images. Report problems in [this fork's issues](https://github.com/CleverWild/wplace-bot/issues).

## Features

1. Auto draw
2. Multiple images
3. Many strategies
4. Auto image convert/scale
5. Suggests colors to buy
6. Optional captcha bypass

## Installation

1. Install TamperMonkey browser extension: [Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en) | [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
2. [Open this link](https://github.com/CleverWild/wplace-bot/raw/refs/heads/main/dist.user.js)
3. Press install.
4. Allow user scripts.

## How to use

1. Add an image or exported `.wbot` file.
2. Drag the image and its edges to position and resize it.
3. Change the image order.
4. Configure the colors bar and enable **Draw color in order** when needed.
5. Configure substitution colors: the upper button buys a color and the lower button disables it.
6. Export an image or a `.wbot` file to preserve its settings.
7. Lock an image to prevent accidental edits and allow click-through.
8. Delete an image when it is no longer needed.
9. Click **Draw** to queue the current work. **Auto-Draw** submits each queued pixel as charges become available; use it only when that automatic submission is intended.

See the [dated map-positioning research](docs/map-positioning-research.md) and the [manual smoke checklist](docs/manual-smoke-check.md) for maintainer details.

![Instruction1](https://github.com/CleverWild/wplace-bot/raw/refs/heads/main/Instruction.png)

## Contribution

1. Install [Bun](https://bun.sh/).
2. Install dependencies: `bun i`.
3. Bump `@version` in `script.txt` before a release.
4. Run `bun run check` for non-mutating checks.
5. Run `bun run fix` for formatting and lint fixes.
6. Run `bun run build` to write the shipped `dist.user.js`.
7. Run `bun run build:check` to verify the committed artifact without writing it.
