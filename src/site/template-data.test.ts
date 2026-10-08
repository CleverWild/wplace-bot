import { expect, test } from 'bun:test'

import { COLORS_RGB } from '../colors'
import { worldToLatitude, worldToLongitude } from '../coordinates'

import {
  allowedTemplateColors,
  indexTemplatePixels,
  parseSiteTemplates,
  planTemplateSync,
  type SiteTemplate,
  usedPaletteIndices,
} from './template-data'

function metadata(id: string, x: number, y: number, w: number, h: number) {
  return {
    id,
    name: `template ${id}`,
    hasPlaced: true,
    visible: true,
    colorMetric: 'lab',
    dithering: false,
    colorPaletteMode: 'all',
    updatedAt: 1,
    bounds: {
      west: worldToLongitude(x),
      east: worldToLongitude(x + w),
      north: worldToLatitude(y),
      south: worldToLatitude(y + h),
    },
  }
}

function template(id: string): SiteTemplate {
  return parseSiteTemplates([metadata(id, 0, 0, 1, 1)])[0]!
}

test('bounds become a world position and size', () => {
  const [parsed] = parseSiteTemplates([metadata('a', 1000, 2000, 30, 20)])
  expect(parsed).toMatchObject({
    id: 'a',
    name: 'template a',
    position: [1000, 2000],
    width: 30,
    height: 20,
    visible: true,
    colorMetric: 'lab',
    dithering: false,
    colorPaletteMode: 'all',
  })
})

test('unplaced and server managed templates are not ours', () => {
  const list = parseSiteTemplates([
    { ...metadata('a', 0, 0, 1, 1), hasPlaced: false },
    { ...metadata('b', 0, 0, 1, 1), serverManaged: true },
    metadata('c', 0, 0, 1, 1),
  ])
  expect(list.map((item) => item.id)).toEqual(['c'])
})

test('hiding a template changes the content key but a rename does not', () => {
  const base = parseSiteTemplates([metadata('a', 5, 5, 4, 4)])[0]!
  const hidden = parseSiteTemplates([
    { ...metadata('a', 5, 5, 4, 4), visible: false },
  ])[0]!
  const renamed = parseSiteTemplates([
    { ...metadata('a', 5, 5, 4, 4), name: 'other' },
  ])[0]!
  expect(hidden.visible).toBe(false)
  expect(hidden.contentKey).not.toBe(base.contentKey)
  expect(renamed.contentKey).toBe(base.contentKey)
  expect(renamed.revision).not.toBe(base.revision)
})

test('a moved or stretched template changes the content key', () => {
  const key = (...args: [number, number, number, number]) =>
    parseSiteTemplates([metadata('a', ...args)])[0]!.contentKey
  expect(key(0, 0, 4, 4)).not.toBe(key(1, 0, 4, 4))
  expect(key(0, 0, 4, 4)).not.toBe(key(0, 0, 5, 4))
})

test('unreadable metadata is an error, never an empty list', () => {
  expect(() => parseSiteTemplates(undefined)).toThrow()
  expect(() => parseSiteTemplates([null])).toThrow()
  expect(() =>
    parseSiteTemplates([metadata('a', 0, 0, 1, 1), metadata('a', 0, 0, 1, 1)]),
  ).toThrow()
  expect(() =>
    parseSiteTemplates([{ ...metadata('a', 0, 0, 1, 1), colorMetric: 'x' }]),
  ).toThrow()
  expect(() =>
    parseSiteTemplates([{ ...metadata('a', 0, 0, 1, 1), bounds: {} }]),
  ).toThrow()
})

test('palette modes decide which colors a template may use', () => {
  const unavailable = new Set([40, 41])
  const mode = (colorPaletteMode: SiteTemplate['colorPaletteMode']) =>
    allowedTemplateColors({ ...template('a'), colorPaletteMode }, unavailable)
  expect(mode('all')).toBeUndefined()
  expect(mode('template')).toBeUndefined()
  expect(mode('free')).toEqual(Array.from({ length: 31 }, (_, i) => i + 1))
  const unlocked = mode('unlocked')!
  expect(unlocked).not.toContain(40)
  expect(unlocked).toContain(39)
  expect(unlocked).not.toContain(0)
})

test('rgba pixels turn into palette indices', () => {
  const [, red, blue] = [0, COLORS_RGB[5]!, COLORS_RGB[20]!]
  const data = new Uint8ClampedArray([
    0,
    0,
    0,
    0,
    red >> 16,
    (red >> 8) & 255,
    red & 255,
    255,
    blue >> 16,
    (blue >> 8) & 255,
    blue & 255,
    255,
  ])
  expect([...indexTemplatePixels(data, 3, 1)]).toEqual([0, 5, 20])
  expect(usedPaletteIndices(data)).toEqual([5, 20])
})

test('a color outside the palette is refused instead of guessed', () => {
  expect(() =>
    indexTemplatePixels(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1),
  ).toThrow()
  expect(() => indexTemplatePixels(new Uint8ClampedArray(4), 2, 1)).toThrow()
})

test('sync keeps saved order, appends new templates and removes vanished ones', () => {
  const site = ['c', 'a', 'd', 'x'].map(template)
  expect(planTemplateSync(['a', 'b'], ['d', 'z', 'c'], site)).toEqual({
    remove: ['b'],
    create: ['d', 'c', 'x'],
  })
})

test('a template that is already shown is never created twice', () => {
  const site = ['a', 'b'].map(template)
  expect(planTemplateSync(['a', 'b'], [], site)).toEqual({
    remove: [],
    create: [],
  })
})
