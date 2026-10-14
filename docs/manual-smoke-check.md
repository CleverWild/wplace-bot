# Manual smoke checklist

Record an outcome and a short note for each item. Leave the outcome as `Not tested` until the check has actually been performed.

| Area        | Check                                                                                                                              | Outcome    | Notes |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| Templates   | Place, edit the picture (same size), move, stretch, hide, delete and restore a template in wplace; confirm the bot follows. | Not tested |       |
| Templates   | Compare a template's queue with wplace's own preview for dithering, palette modes, color metrics and transparency.       | Not tested |       |
| Persistence | Load a version 10 save and confirm linked settings and order carry over, unlinked images are counted and archived.       | Not tested |       |
| Persistence | Reload after saving and confirm the images and settings return.                                                                    | Not tested |       |
| Persistence | Import legacy save data and confirm migration preserves usable images.                                                             | Not tested |       |
| Settings    | Exercise every image setting, including visibility, ordering, color order and substitutions.   | Not tested |       |
| Geometry    | Click small, wide, tall, and large art thumbnails. Confirm each art is centered and fully visible with a small margin at any screen size. | Not tested |       |
| Camera      | Confirm the map projection and camera path work with the supported camera state. Bearing and pitch support is not assumed.         | Not tested |       |
| Drawing     | In an explicitly authorized live test, click **Draw** and confirm it queues work without automatically submitting every pixel.     | Not tested |       |
| Drawing     | In an explicitly authorized live test, enable **Auto-Draw** and confirm queued pixels submit only when charges are available.      | Not tested |       |
| Drawing     | Exercise partial progress and an API or network error; confirm completed work stays recorded and the remaining queue can continue. | Not tested |       |
| Recovery    | Start without a usable map and confirm the bot reports the missing map without prompting to reset saved data.                      | Not tested |       |

Do not run the live drawing rows without explicit authorization for that specific test. Keep the other rows local or read-only where possible.
| Drawing     | Edit a template while a draw runs; confirm the pass stops, nothing is submitted and the status asks to clear staged pixels. | Not tested |       |
| Recovery    | Break template discovery (block wplace chunks) and confirm drawing is blocked with an error and no reset prompt.          | Not tested |       |
