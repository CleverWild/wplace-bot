/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WPlaceBot } from './bot'
import { BotImage, ImageStrategy, UnownedColorStrategy } from './image'

const DB_NAME = 'wbot'
const STORE_NAME = 'saves'
const KEY_NAME = 'wbot'
const DB_VERSION = 1
export const SAVE_VERSION = 4

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(STORE_NAME))
      db.createObjectStore(STORE_NAME)
  }
  request.onsuccess = () => {
    resolve(request.result)
  }
  request.onerror = () => {
    reject(request.error)
  }
})

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await dbPromise
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => {
      resolve(request.result as T | undefined)
    }
    request.onerror = () => {
      reject(request.error)
    }
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(value, key)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(tx.error)
    }
  })
}

export function DELETE_ALL_DATA() {
  indexedDB.deleteDatabase(DB_NAME)
}

/** Loads a save and returns JSON */
export async function loadSave() {
  try {
    await migrateSaveFromLS()
    const raw = await idbGet<ReturnType<WPlaceBot['toJSON']> | null>(KEY_NAME)
    if (typeof raw !== 'object' || raw === null) return
    return migrate(raw)
  } catch {
    return
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | undefined
/** Make save. Actually makes save only after 1 second */
export async function save(bot: WPlaceBot, immediate = false) {
  clearTimeout(saveTimeout)
  if (immediate) await idbSet(KEY_NAME, await bot.toJSON())
  else
    await new Promise<void>((resolve) => {
      saveTimeout = setTimeout(async () => {
        await idbSet(KEY_NAME, await bot.toJSON())
        resolve()
      }, 1000)
    })
}

/** Migrates save from local storage */
async function migrateSaveFromLS() {
  let legacyKey = ''
  for (let index = 0; index < localStorage.length; index++) {
    legacyKey = localStorage.key(index)!
    if (legacyKey.endsWith(KEY_NAME)) break
  }
  if (legacyKey.endsWith(KEY_NAME)) {
    const json = localStorage.getItem(legacyKey)
    if (json) {
      try {
        const parsed = JSON.parse(json)
        if (typeof parsed === 'object') await idbSet(KEY_NAME, parsed)
      } catch {
        // ignore corrupt legacy data
      }
    }
    localStorage.removeItem(legacyKey)
  }
}

/** How to migrate save data for images */
export function migrateImage(
  old: any,
): Awaited<ReturnType<BotImage['toJSON']>> {
  let image = old
  if (!image.version || image.version < 3)
    image = {
      url: image.pixels.url,
      width: image.pixels.width,
      height: undefined,
      brightness: image.pixels.brightness,
      colorMetric: 'lab' as const,
      position: image.position,
      strategy: ImageStrategy.SPIRAL_TO_CENTER,
      opacity: image.opacity,
      drawTransparentPixels: image.drawTransparentPixels,
      drawColorsInOrder: image.drawColorsInOrder,
      colors: [],
      disabledColors: [],
      lock: image.lock,
      disabled: false,
      name: `Unnamed image`,
      unownedColorStrategy: UnownedColorStrategy.BUY,
      wplaceId: undefined,
      version: 3,
    }
  // `disabled` used to hold the site's visibility for imported templates.
  // It is the user's own switch now, so hand the old value to `siteDisabled`
  if (image.version < 4)
    image = {
      ...image,
      disabled: image.wplaceId ? false : Boolean(image.disabled),
      siteDisabled: image.wplaceId ? Boolean(image.disabled) : false,
      version: 4,
    }
  return image
}

/** How to migrate save data */
export function migrate(old: any): Awaited<ReturnType<WPlaceBot['toJSON']>> {
  let save = old
  if (!save.version || save.version < 3)
    save = {
      version: 3,
      images: save.images,
      strategy: save.strategy,
      title: 'WPlace-bot',
    }
  // Images carry their own version, so migrate them whatever the save says
  return {
    ...save,
    version: SAVE_VERSION,
    images: save.images.map(migrateImage),
  }
}
