import { expect, test } from 'bun:test'

import {
  confirmedTaskPrefix,
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

test('keeps tasks after the first unconfirmed paint', () => {
  expect(confirmedTaskPrefix([true, true, false, true])).toBe(2)
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
