# Manual smoke checklist

Record an outcome and a short note for each item. Leave the outcome as `Not tested` until the check has actually been performed.

| Area        | Check                                                                                                                              | Outcome    | Notes |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| Persistence | Import a `.wbot` file, then export it and compare the settings and pixels.                                                         | Not tested |       |
| Persistence | Reload after saving and confirm the images and settings return.                                                                    | Not tested |       |
| Persistence | Import legacy save data and confirm migration preserves usable images.                                                             | Not tested |       |
| Settings    | Exercise every image setting, including opacity, visibility, lock, brightness, scale, color metric, ordering, and substitutions.   | Not tested |       |
| Geometry    | Move an image and resize it from each edge or handle.                                                                              | Not tested |       |
| Geometry    | Pan the map and confirm the overlay follows its world position.                                                                    | Not tested |       |
| Geometry    | Zoom the map and confirm the overlay scale and position remain aligned.                                                            | Not tested |       |
| Geometry    | Resize the viewport and confirm the overlay redraws and remains aligned.                                                           | Not tested |       |
| Geometry    | Test with a nonzero map canvas offset in the viewport.                                                                             | Not tested |       |
| Camera      | Confirm the map projection and camera path work with the supported camera state. Bearing and pitch support is not assumed.         | Not tested |       |
| Drawing     | In an explicitly authorized live test, click **Draw** and confirm it queues work without automatically submitting every pixel.     | Not tested |       |
| Drawing     | In an explicitly authorized live test, enable **Auto-Draw** and confirm queued pixels submit only when charges are available.      | Not tested |       |
| Drawing     | Exercise partial progress and an API or network error; confirm completed work stays recorded and the remaining queue can continue. | Not tested |       |
| Recovery    | Start without a usable map and confirm the bot reports the missing map without prompting to reset saved data.                      | Not tested |       |

Do not run the live drawing rows without explicit authorization for that specific test. Keep the other rows local or read-only where possible.
