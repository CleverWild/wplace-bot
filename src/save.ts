import { migrate } from './persistence/migrations'
import { SaveQueue } from './persistence/save-queue'
import { type LoadedBot, type SavedBot } from './persistence/schema'
import { idbGet, idbSet, SAVE_KEY } from './persistence/store'

const queue = new SaveQueue<SavedBot>((data) => idbSet(SAVE_KEY, data))

/** Loads a save and returns JSON */
export async function loadSave(): Promise<LoadedBot | undefined> {
  try {
    await migrateSaveFromLS()
    const raw = await idbGet<unknown>(SAVE_KEY)
    if (typeof raw !== 'object' || raw === null) return
    return migrate(raw)
  } catch {
    return
  }
}

/** Make save. Actually makes save only after 1 second */
export function save(
  bot: { toJSON(): Promise<SavedBot> },
  immediate = false,
): Promise<void> {
  return queue.save(() => bot.toJSON(), immediate)
}

/** Migrates save from local storage */
async function migrateSaveFromLS() {
  let legacyKey = ''
  for (let index = 0; index < localStorage.length; index++) {
    legacyKey = localStorage.key(index)!
    if (legacyKey.endsWith(SAVE_KEY)) break
  }
  if (legacyKey.endsWith(SAVE_KEY)) {
    const json = localStorage.getItem(legacyKey)
    if (json) {
      try {
        const parsed = JSON.parse(json) as unknown
        if (typeof parsed === 'object') await idbSet(SAVE_KEY, parsed)
      } catch {
        // ignore corrupt legacy data
      }
    }
    localStorage.removeItem(legacyKey)
  }
}
