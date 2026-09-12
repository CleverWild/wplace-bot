import { expect, test } from 'bun:test'

import { RegionOrder } from '../ordering'

import { createImageSettings } from './model'

test('every call owns its colors and disabled colors', () => {
  const a = createImageSettings()
  const b = createImageSettings()
  a.colors.push(1)
  a.disabledColors.add(1)
  expect(b.colors).toEqual([])
  expect(b.disabledColors.size).toBe(0)
})

test('overrides are copied, not shared', () => {
  const colors = [1, 2]
  const disabledColors = new Set([2])
  const settings = createImageSettings({ colors, disabledColors })
  colors.push(3)
  disabledColors.add(3)
  expect(settings.colors).toEqual([1, 2])
  expect([...settings.disabledColors]).toEqual([2])
})

test('undefined overrides keep the default', () => {
  const settings = createImageSettings({
    opacity: undefined,
    regionOrder: undefined,
    lock: false,
  })
  expect(settings.opacity).toBe(50)
  expect(settings.regionOrder).toBe(RegionOrder.OFF)
  expect(settings.height).toBeUndefined()
})
