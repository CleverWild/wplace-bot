import { expect, test } from 'bun:test'

import { type BotImage } from './image'
import { worldToLatitude, worldToLongitude } from './world-position'
import { fromWplaceFile, readSiteTemplates, toWplaceFile } from './wplace-file'

/** Bounds of a real template exported by wplace, 920x1250 drawn as 92x125 */
const BOUNDS = {
  north: 48.873_039_846_595_43,
  south: 48.858_585_689_305_194,
  west: 9.528_398_437_499_991,
  east: 9.544_570_312_499_987,
}

test('import keeps position and on-map scale', () => {
  const data = fromWplaceFile({
    image: { dataUrl: 'data:image/png;base64,x', width: 920, height: 1250 },
    bounds: BOUNDS,
    opacity: 0.5,
    name: 'template.jpg',
    locked: true,
    visible: false,
  })
  expect(data.position).toEqual([1_078_206, 704_428])
  expect(data.width).toBe(92)
  expect(data.height).toBe(125)
  expect(data.opacity).toBe(50)
  expect(data.lock).toBe(true)
  expect(data.disabled).toBe(true)
})

test('import preserves non-uniform scale from bounds, not image aspect', () => {
  // Deliberately stretched: 100 wide, 300 tall in world pixels, from a square
  // source image. Height must come from the bounds, not the 1:1 image.
  const x = 1_000_000
  const y = 500_000
  const w = 100
  const h = 300
  const data = fromWplaceFile({
    image: { dataUrl: 'data:image/png;base64,x', width: 50, height: 50 },
    bounds: {
      north: worldToLatitude(y),
      south: worldToLatitude(y + h),
      west: worldToLongitude(x),
      east: worldToLongitude(x + w),
    },
  })
  expect(data.width).toBe(w)
  expect(data.height).toBe(h)
})

test('rejects a file without bounds', () => {
  expect(() =>
    fromWplaceFile({ image: { dataUrl: 'data:image/png;base64,x' } }),
  ).toThrow()
})

test('export round-trips back to the same pixels', () => {
  const image = {
    $canvas: { toDataURL: () => 'data:image/png;base64,x' },
    position: { globalX: 1_078_206, globalY: 704_428 },
    width: 92,
    height: 125,
    opacity: 50,
    name: 'template',
    lock: false,
    disabled: false,
  } as unknown as BotImage
  const file = toWplaceFile(image)
  const data = fromWplaceFile(file)
  expect(data.position).toEqual([1_078_206, 704_428])
  expect(data.width).toBe(92)
  expect(data.height).toBe(125)
  expect(data.opacity).toBe(50)
})

test('reads the site template manager, skipping unusable entries', () => {
  const overlays = [
    { id: 'keep', name: 'a', bounds: BOUNDS, opacity: 0.5, locked: false },
    { id: 'no-bounds', name: 'b' },
    { name: 'no-id', bounds: BOUNDS },
    undefined,
  ]
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => JSON.stringify(overlays) },
  })
  const templates = readSiteTemplates()
  expect(templates).toHaveLength(1)
  expect(templates[0]!.id).toBe('keep')
  expect(templates[0]!.data.position).toEqual([1_078_206, 704_428])
  expect(templates[0]!.data.width).toBe(92)
})
