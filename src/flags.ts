import { WORLD_TILE_SIZE, WORLD_TILES } from './coordinates'

/** A bought flag refunds one charge per this many pixels painted in its country */
export const FLAG_CASHBACK_PIXELS = 10

/**
 * Whether `/me`'s `flagsBitmap` holds the flag of `countryId`. It is base64 of
 * a bit set whose lowest ids live in the last byte, the way wplace reads it
 */
export function ownsFlag(flagsBitmap: string | undefined, countryId: number) {
  if (!flagsBitmap) return false
  let bytes: string
  try {
    bytes = atob(flagsBitmap)
  } catch {
    return false
  }
  const byteIndex = Math.floor(countryId / 8)
  if (byteIndex >= bytes.length) return false
  return (
    (bytes.charCodeAt(bytes.length - 1 - byteIndex) &
      (1 << (countryId % 8))) !==
    0
  )
}

/**
 * wplace assigns a country to a whole tile, not to single pixels, so the
 * border runs along tile edges
 */
export function tileKey(tileX: number, tileY: number) {
  return tileY * WORLD_TILES + tileX
}

export function tileFromKey(key: number) {
  return [key % WORLD_TILES, Math.floor(key / WORLD_TILES)] as const
}

export function coveredTiles(
  globalX: number,
  globalY: number,
  width: number,
  height: number,
) {
  const keys: number[] = []
  const lastX = Math.floor((globalX + Math.max(1, width) - 1) / WORLD_TILE_SIZE)
  const lastY = Math.floor(
    (globalY + Math.max(1, height) - 1) / WORLD_TILE_SIZE,
  )
  for (let y = Math.floor(globalY / WORLD_TILE_SIZE); y <= lastY; y++)
    for (let x = Math.floor(globalX / WORLD_TILE_SIZE); x <= lastX; x++)
      keys.push(tileKey(x, y))
  return keys
}

/** Tasks, as flat `[gx, gy, ...]`, that lie on one of `cashbackTiles` */
export function countCashbackTasks(
  tasks: Uint32Array,
  cashbackTiles: ReadonlySet<number>,
) {
  if (cashbackTiles.size === 0) return 0
  let count = 0
  let lastKey = -1
  let lastHit = false
  for (let index = 0; index < tasks.length; index += 2) {
    const key = tileKey(
      (tasks[index]! / WORLD_TILE_SIZE) | 0,
      (tasks[index + 1]! / WORLD_TILE_SIZE) | 0,
    )
    if (key !== lastKey) {
      lastKey = key
      lastHit = cashbackTiles.has(key)
    }
    if (lastHit) count++
  }
  return count
}

export function cashbackCharges(pixels: number) {
  return Math.floor(Math.max(0, pixels) / FLAG_CASHBACK_PIXELS)
}
