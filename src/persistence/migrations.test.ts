import { expect, test } from 'bun:test'

import { BotStrategy, DropletStrategy } from '../drawing/policy'
import { UnownedColorStrategy } from '../image/model'
import { FillDirection, ImageStrategy, RegionOrder } from '../ordering'

import { migrate, migrateImage } from './migrations'
import { SAVE_VERSION, type SavedBot, type SavedImage } from './schema'

const CURRENT_IMAGE: SavedImage = {
  url: 'data:image/webp;base64,x',
  width: 40,
  height: 30,
  brightness: 5,
  colorMetric: 'ciede2000',
  position: [1_078_206, 704_428],
  strategy: ImageStrategy.CONTRAST,
  opacity: 70,
  drawTransparentPixels: true,
  drawColorsInOrder: false,
  colors: [3, 1],
  disabledColors: [1],
  lock: true,
  disabled: true,
  name: 'cat',
  unownedColorStrategy: UnownedColorStrategy.SUBSTITUTE,
  wplaceId: 'abc',
  siteDisabled: true,
  regionOrder: RegionOrder.LARGEST,
  fillDirection: FillDirection.EDGE_IN,
  outlineFirst: true,
  version: SAVE_VERSION,
}

test('a current image passes through unchanged', () => {
  expect(migrateImage(structuredClone(CURRENT_IMAGE))).toEqual(CURRENT_IMAGE)
})

test('a current save passes through unchanged', () => {
  const save: SavedBot = {
    version: SAVE_VERSION,
    images: [CURRENT_IMAGE],
    strategy: BotStrategy.PERCENTAGE,
    dropletStrategy: DropletStrategy.COLORS_FIRST,
    title: 'mine',
  }
  expect(migrate(structuredClone(save))).toEqual(save)
})

test('an image from before version 3 keeps its pixels settings', () => {
  const image = migrateImage({
    pixels: { url: 'data:x', width: 12, brightness: -3 },
    position: [5, 6],
    opacity: 40,
    drawTransparentPixels: true,
    drawColorsInOrder: false,
    lock: true,
  })
  expect(image).toMatchObject({
    url: 'data:x',
    width: 12,
    brightness: -3,
    colorMetric: 'lab',
    position: [5, 6],
    strategy: ImageStrategy.SPIRAL_TO_CENTER,
    opacity: 40,
    drawTransparentPixels: true,
    drawColorsInOrder: false,
    lock: true,
    disabled: false,
    siteDisabled: false,
    name: 'Unnamed image',
    unownedColorStrategy: UnownedColorStrategy.BUY,
    regionOrder: RegionOrder.OFF,
    fillDirection: FillDirection.SEED_OUT,
    outlineFirst: false,
    version: 6,
  })
})

test('version 3 hands a template visibility to siteDisabled', () => {
  const template = migrateImage({
    url: 'x',
    wplaceId: 'id',
    disabled: true,
    version: 3,
  })
  expect(template.disabled).toBe(false)
  expect(template.siteDisabled).toBe(true)
  const own = migrateImage({ url: 'x', disabled: true, version: 3 })
  expect(own.disabled).toBe(true)
  expect(own.siteDisabled).toBe(false)
})

test('version 4 has no blob fill', () => {
  const image = migrateImage({ url: 'x', version: 4 })
  expect(image.regionOrder).toBe(RegionOrder.OFF)
  expect(image).not.toHaveProperty('floodFill')
})

test('version 5 moves the fill checkbox into the region order', () => {
  expect(
    migrateImage({ url: 'x', floodFill: true, regionOrder: 'NONE', version: 5 })
      .regionOrder,
  ).toBe(RegionOrder.IN_ORDER)
  expect(
    migrateImage({
      url: 'x',
      floodFill: true,
      regionOrder: RegionOrder.LARGEST,
      version: 5,
    }).regionOrder,
  ).toBe(RegionOrder.LARGEST)
  expect(
    migrateImage({
      url: 'x',
      floodFill: false,
      regionOrder: RegionOrder.LARGEST,
      version: 5,
    }).regionOrder,
  ).toBe(RegionOrder.OFF)
})

test('a save from before version 3 gets a title and colors-only droplets', () => {
  const save = migrate({ images: [], strategy: BotStrategy.ALL })
  expect(save).toEqual({
    version: SAVE_VERSION,
    images: [],
    strategy: BotStrategy.ALL,
    dropletStrategy: DropletStrategy.COLORS,
    title: 'WPlace-bot',
  })
})

test('version 7 charges-only droplets become colors first', () => {
  const save = migrate({
    version: 7,
    images: [],
    strategy: BotStrategy.ALL,
    dropletStrategy: 'CHARGES',
    title: 't',
  })
  expect(save.dropletStrategy).toBe(DropletStrategy.COLORS_FIRST)
})

test('malformed data is rejected instead of cast', () => {
  expect(() => migrate(undefined)).toThrow()
  expect(() => migrate({ version: 8 })).toThrow()
  expect(() => migrateImage('image')).toThrow()
  expect(() => migrateImage({ version: 6 })).toThrow()
})
