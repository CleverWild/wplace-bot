import { expect, test } from 'bun:test'

import { TileCache } from './tile-cache'
import { packTile } from './tiles'

function recordingCache() {
  const loaded: string[] = []
  const cache = new TileCache((tileX, tileY) => {
    loaded.push(`${tileX},${tileY}`)
    return Promise.resolve(new Uint8Array([tileX, tileY]))
  })
  return { cache, loaded }
}

test('loads every tile under the area, end edges inclusive', async () => {
  const { cache, loaded } = recordingCache()
  const progress: number[] = []
  const maps = await cache.load(999, 999, 1, 1, (p) => progress.push(p))
  expect([...loaded].sort()).toEqual(['0,0', '0,1', '1,0', '1,1'])
  expect([...maps.get(packTile(1, 0))!]).toEqual([1, 0])
  expect(progress.at(-1)).toBe(0.1)
})

test('keeps loaded tiles until cleared', async () => {
  const { cache, loaded } = recordingCache()
  await cache.load(10, 10, 5, 5)
  await cache.load(20, 20, 5, 5)
  expect(loaded).toEqual(['0,0'])
  cache.clear()
  await cache.load(10, 10, 5, 5)
  expect(loaded).toEqual(['0,0', '0,0'])
})

test('a failed tile fails the load and is not cached', async () => {
  let fail = true
  const cache = new TileCache(() =>
    fail
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(new Uint8Array(1)),
  )
  const failure = await cache.load(0, 0, 1, 1).then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(failure).toEqual(new Error('offline'))
  fail = false
  const maps = await cache.load(0, 0, 1, 1)
  expect(maps.has(packTile(0, 0))).toBe(true)
})
