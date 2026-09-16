import { expect, test } from 'bun:test'

import {
  cashbackCharges,
  countCashbackTasks,
  coveredTiles,
  ownsFlag,
  tileKey,
} from './flags'

function bitmap(...countryIds: number[]) {
  const length = Math.max(...countryIds.map((id) => Math.floor(id / 8))) + 1
  const bytes = new Uint8Array(length)
  // wplace keeps the lowest ids in the last byte
  for (const id of countryIds)
    bytes[length - 1 - Math.floor(id / 8)]! |= 1 << (id % 8)
  return Buffer.from(bytes).toString('base64')
}

test('reads a bought flag out of the bitmap', () => {
  expect(ownsFlag(bitmap(75), 75)).toBe(true)
})

test('does not see flags that were not bought', () => {
  const flags = bitmap(75, 3)
  expect(ownsFlag(flags, 82)).toBe(false)
  expect(ownsFlag(flags, 74)).toBe(false)
  expect(ownsFlag(flags, 3)).toBe(true)
})

test('an empty or missing bitmap owns nothing', () => {
  expect(ownsFlag('AA==', 0)).toBe(false)
  expect(ownsFlag(undefined, 75)).toBe(false)
  expect(ownsFlag('', 75)).toBe(false)
})

test('a flag past the end of the bitmap is not owned', () => {
  expect(ownsFlag(bitmap(3), 200)).toBe(false)
  expect(ownsFlag(bitmap(3), 8)).toBe(false)
})

test('lists every tile an image overlaps', () => {
  expect(coveredTiles(1_067_900, 705_999, 200, 2).sort()).toEqual(
    [
      tileKey(1067, 705),
      tileKey(1068, 705),
      tileKey(1067, 706),
      tileKey(1068, 706),
    ].sort(),
  )
})

test('an image inside one tile covers only that tile', () => {
  expect(coveredTiles(1_068_000, 706_000, 1000, 1000)).toEqual([
    tileKey(1068, 706),
  ])
})

test('counts only the tasks on tiles with a bought flag', () => {
  const tasks = new Uint32Array([
    1_067_999, 706_010, 1_068_000, 706_010, 1_068_500, 706_999, 1_068_500,
    707_000,
  ])
  expect(countCashbackTasks(tasks, new Set([tileKey(1068, 706)]))).toBe(2)
})

test('no flagged tiles means no cashback tasks', () => {
  expect(countCashbackTasks(new Uint32Array([5, 5]), new Set())).toBe(0)
})

test('pays one charge back for every ten pixels', () => {
  expect(cashbackCharges(9)).toBe(0)
  expect(cashbackCharges(10)).toBe(1)
  expect(cashbackCharges(129)).toBe(12)
})
