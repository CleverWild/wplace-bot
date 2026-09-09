import { wait } from '@softsky/utils'

import { type WPlaceBot } from './bot'
import { NoMapError } from './errors'

/**
 * The part of maplibre's Map we use. Structural on purpose: maplibre is
 * wplace's dependency, not ours, and we never construct one.
 */
export type WplaceMap = {
  project(lngLat: [number, number]): { x: number; y: number }
  unproject(point: [number, number]): { lat: number; lng: number }
  getZoom(): number
  getCanvas(): HTMLCanvasElement
  jumpTo(options: { center?: [number, number]; zoom?: number }): unknown
  panBy(offset: [number, number], options?: { duration: number }): unknown
  on(type: string, listener: () => unknown): { unsubscribe(): void }
}

/**
 * wplace's own state store. It holds the live map, and the sticky flag wplace
 * raises when an untrusted click reaches the map — that flag is signed into
 * every protected request, so never let it go up.
 */
export type WplaceStore = {
  map?: WplaceMap
  automatedClicks: boolean
}

const CHUNK_PREFIX = `${location.origin}/_app/immutable/`

/**
 * Every app chunk the page has pulled. Collected through an observer instead
 * of one late getEntriesByType call, because the resource timing buffer fills
 * up and drops entries once the map starts fetching tiles.
 */
const chunkUrls = new Set<string>()
new PerformanceObserver((list) => {
  const entries = list.getEntries()
  for (let index = 0; index < entries.length; index++) {
    const { name } = entries[index]!
    if (name.startsWith(CHUNK_PREFIX) && name.endsWith('.js'))
      chunkUrls.add(name)
  }
}).observe({ buffered: true, type: 'resource' })

let store: WplaceStore | undefined

function isStore(value: unknown): value is WplaceStore {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'automatedClicks' in value &&
    'map' in value
  )
}

/**
 * wplace ships its state store as an ordinary chunk export, so importing that
 * chunk again hands back the very object the site is using: the module
 * registry is shared and the chunk has already run, so nothing re-executes.
 */
async function findStore() {
  for (const url of chunkUrls) {
    let module: Record<string, unknown>
    try {
      module = (await import(url)) as Record<string, unknown>
    } catch {
      continue
    }
    const keys = Object.keys(module)
    for (let index = 0; index < keys.length; index++) {
      let value: unknown
      // A namespace getter can still throw while its module initializes
      try {
        value = module[keys[index]!]
      } catch {
        continue
      }
      if (isStore(value)) return value
    }
  }
  return undefined
}

/** wplace's state store, once it has been found */
export function getStore() {
  return store
}

/** Wait until wplace has built its map, then hand it over */
export async function findMap(bot: WPlaceBot, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    store ??= await findStore()
    if (store?.map) return store.map
    await wait(100)
  }
  throw new NoMapError(bot)
}
