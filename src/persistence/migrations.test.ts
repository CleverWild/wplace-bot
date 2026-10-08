import { expect, test } from 'bun:test'

import { BotStrategy, DropletStrategy } from '../drawing/policy'
import { UnownedColorStrategy } from '../image/model'
import { FillDirection, ImageStrategy, RegionOrder } from '../ordering'

import { migrate, migrateImage } from './migrations'
import { SAVE_VERSION, type SavedBot, type SavedImage } from './schema'

const CURRENT_IMAGE: SavedImage = {
  wplaceId: 'abc',
  strategy: ImageStrategy.CONTRAST,
  drawTransparentPixels: true,
  drawColorsInOrder: false,
  colors: [3, 1],
  disabledColors: [1],
  disabled: true,
  unownedColorStrategy: UnownedColorStrategy.SUBSTITUTE,
  regionOrder: RegionOrder.LARGEST,
  fillDirection: FillDirection.EDGE_IN,
  outlineFirst: true,
}

const OLD_IMAGE = {
  url: 'data:image/webp;base64,x',
  width: 40,
  height: 30,
  brightness: 5,
  opacity: 70,
  position: [1_078_206, 704_428],
  lock: true,
  name: 'cat',
  siteDisabled: true,
  ...CURRENT_IMAGE,
  version: 10,
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
    widgetOpen: false,
    tileCountries: [[1_445_064, 82]],
  }
  expect(migrate(structuredClone(save))).toEqual(save)
})

test('an old image keeps its drawing settings and drops what the site owns', () => {
  const image = migrateImage(structuredClone(OLD_IMAGE), true)
  expect(image).toEqual(CURRENT_IMAGE)
})

test('a version 10 save keeps linked images in order and counts the rest', () => {
  const save = migrate({
    version: 10,
    images: [
      { ...OLD_IMAGE, wplaceId: 'b', name: 'second' },
      { ...OLD_IMAGE, wplaceId: undefined },
      { ...OLD_IMAGE, wplaceId: '' },
      { ...OLD_IMAGE, wplaceId: 'a' },
      { ...OLD_IMAGE, wplaceId: 'b' },
    ],
    strategy: BotStrategy.ALL,
    dropletStrategy: DropletStrategy.COLORS,
    title: 't',
    widgetOpen: true,
    tileCountries: [],
  })
  expect(save.version).toBe(SAVE_VERSION)
  expect(save.images.map((image) => image.wplaceId)).toEqual(['b', 'a'])
  expect(save.archivedImageCount).toBe(2)
  expect(save.images[0]).toEqual({ ...CURRENT_IMAGE, wplaceId: 'b' })
})

test('a current save without a template id is rejected', () => {
  expect(() =>
    migrate({
      version: SAVE_VERSION,
      images: [{ ...CURRENT_IMAGE, wplaceId: undefined }],
      strategy: BotStrategy.ALL,
      dropletStrategy: DropletStrategy.COLORS,
      title: 't',
      widgetOpen: true,
      tileCountries: [],
    }),
  ).toThrow()
})

test('an image from before version 3 was never linked to a template', () => {
  expect(() =>
    migrateImage({ pixels: { url: 'data:x', width: 12 } }, true),
  ).toThrow('no Wplace ID')
})

test('version 3 hands a template visibility to the site', () => {
  const template = migrateImage(
    { url: 'x', wplaceId: 'id', disabled: true, version: 3 },
    true,
  )
  expect(template.disabled).toBe(false)
})

test('version 4 has no blob fill', () => {
  const image = migrateImage({ wplaceId: 'id', version: 4 }, true)
  expect(image.regionOrder).toBe(RegionOrder.OFF)
  expect(image).not.toHaveProperty('floodFill')
})

test('version 5 moves the fill checkbox into the region order', () => {
  const at = (floodFill: boolean, regionOrder: string) =>
    migrateImage({ wplaceId: 'id', floodFill, regionOrder, version: 5 }, true)
      .regionOrder
  expect(at(true, 'NONE')).toBe(RegionOrder.IN_ORDER)
  expect(at(true, RegionOrder.LARGEST)).toBe(RegionOrder.LARGEST)
  expect(at(false, RegionOrder.LARGEST)).toBe(RegionOrder.OFF)
})

test('a save from before version 3 gets a title and colors-only droplets', () => {
  const save = migrate({ images: [], strategy: BotStrategy.ALL })
  expect(save).toEqual({
    version: SAVE_VERSION,
    images: [],
    strategy: BotStrategy.ALL,
    dropletStrategy: DropletStrategy.COLORS,
    title: 'WPlace-bot',
    widgetOpen: true,
    tileCountries: [],
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

test('version 8 saves default the widget to open', () => {
  const save = migrate({
    version: 8,
    images: [],
    strategy: BotStrategy.ALL,
    dropletStrategy: DropletStrategy.COLORS,
    title: 't',
  })
  expect(save).toMatchObject({ widgetOpen: true })
})

test('version 9 saves start with no known tile countries', () => {
  const save = migrate({
    version: 9,
    images: [],
    strategy: BotStrategy.ALL,
    dropletStrategy: DropletStrategy.COLORS,
    title: 't',
    widgetOpen: true,
  })
  expect(save.tileCountries).toEqual([])
})

test('a broken tile country cache is dropped, not trusted', () => {
  const save = migrate({
    version: SAVE_VERSION,
    images: [],
    strategy: BotStrategy.ALL,
    dropletStrategy: DropletStrategy.COLORS,
    title: 't',
    widgetOpen: true,
    tileCountries: [[1, 2], [3], 'x', [4, '5']],
  })
  expect(save.tileCountries).toEqual([[1, 2]])
})

test('malformed data is rejected instead of cast', () => {
  expect(() => migrate(undefined)).toThrow()
  expect(() => migrate({ version: 8 })).toThrow()
  expect(() => migrateImage('image')).toThrow()
  expect(() => migrateImage({ version: 6 }, true)).toThrow()
})
