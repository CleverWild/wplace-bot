import { expect, test } from 'bun:test'

import { formatEta } from './utils'

test('keeps hours when ETA is under a day', () => {
  expect(formatEta(23 * 60 + 59)).toBe('23h 59m')
})

test('shows days and remaining hours when ETA reaches a day', () => {
  expect(formatEta(2 * 24 * 60 + 3 * 60 + 5)).toBe('2d 3h 5m')
})

test('shows one day at exactly 24 hours', () => {
  expect(formatEta(24 * 60)).toBe('1d 0h 0m')
})
