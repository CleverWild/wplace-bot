import { migrate } from './persistence/migrations'
import { SaveQueue } from './persistence/save-queue'
import {
  type LoadedBot,
  SAVE_VERSION,
  type SavedBot,
} from './persistence/schema'
import {
  archiveAndMigrateSave,
  idbGet,
  idbSet,
  SAVE_KEY,
} from './persistence/store'

const queue = new SaveQueue<SavedBot>((data) => idbSet(SAVE_KEY, data))
let loadFailure: Error | undefined

export async function loadSave(): Promise<LoadedBot | undefined> {
  try {
    let raw = await idbGet<unknown>(SAVE_KEY)
    let legacyKey: string | undefined
    if (raw === undefined) {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key?.endsWith(SAVE_KEY)) {
          const json = localStorage.getItem(key)
          if (json !== null) {
            raw = JSON.parse(json) as unknown
            legacyKey = key
            break
          }
        }
      }
    }
    if (raw === undefined) {
      loadFailure = undefined
      return
    }
    const loaded = migrate(raw)
    const version = (raw as { version?: unknown }).version
    if (typeof version !== 'number' || version < SAVE_VERSION) {
      const { archivedImageCount: _, ...persisted } = loaded
      await archiveAndMigrateSave(raw, persisted)
    } else if (legacyKey) await idbSet(SAVE_KEY, loaded)
    if (legacyKey) localStorage.removeItem(legacyKey)
    loadFailure = undefined
    return loaded
  } catch (error) {
    loadFailure = error instanceof Error ? error : new Error(String(error))
    throw loadFailure
  }
}

export function save(
  bot: { toJSON(): Promise<SavedBot> },
  immediate = false,
): Promise<void> {
  if (loadFailure) return Promise.reject(loadFailure)
  return queue.save(() => bot.toJSON(), immediate)
}
