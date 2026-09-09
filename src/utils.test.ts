import { expect, test } from 'bun:test'

import {
  CHARGES_PER_PACK_WITH_PAYBACK,
  estimateEtaMinutes,
  formatEta,
  nextTaskIndex,
} from './utils'

test('keeps the task queued when painting was not confirmed', () => {
  expect(nextTaskIndex(3, false)).toBe(3)
})

test('advances the task only after painting was confirmed', () => {
  expect(nextTaskIndex(3, true)).toBe(4)
})

test('accounts for charges regenerated since the last account update', () => {
  expect(estimateEtaMinutes(10, 0, 10, 30_000, 15_000)).toBe(4.75)
})

test('does not regenerate more charges than the account maximum', () => {
  expect(estimateEtaMinutes(10, 9, 10, 30_000, 60_000)).toBe(0)
})

test('keeps hours when ETA is under a day', () => {
  expect(formatEta(23 * 60 + 59)).toBe('23h 59m')
})

test('shows days and remaining hours when ETA reaches a day', () => {
  expect(formatEta(2 * 24 * 60 + 3 * 60 + 5)).toBe('2d 3h 5m')
})

test('shows one day at exactly 24 hours', () => {
  expect(formatEta(24 * 60)).toBe('1d 0h 0m')
})

test('leaves the estimate alone when droplets are not spent on charges', () => {
  expect(estimateEtaMinutes(100, 0, 100, 30_000, 0)).toBe(50)
})

test('turns the droplet balance into charges already bought', () => {
  // 1000 droplets buy two packs of 30, and 100 pixels pay 6 of themselves back
  expect(estimateEtaMinutes(100, 0, 100, 30_000, 0, 1000)).toBe(17)
})

test('shortens the estimate by what painting pays back', () => {
  expect(estimateEtaMinutes(100, 0, 100, 30_000, 0, 0)).toBe(47)
})

test('a pack covers more pixels than its charges, thanks to the payback', () => {
  expect(CHARGES_PER_PACK_WITH_PAYBACK).toBeCloseTo(31.915, 3)
})

test('spends droplets on missing colors before charges', () => {
  // 2600 in the bank plus 100 earned, less 2000 for the color, is 42 charges
  expect(estimateEtaMinutes(100, 0, 100, 30_000, 0, 2600, 1)).toBe(29)
})

test('leaves nothing for charges when colors eat the whole balance', () => {
  expect(estimateEtaMinutes(100, 0, 100, 30_000, 0, 2600, 2)).toBe(50)
})
