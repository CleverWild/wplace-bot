import { DropletStrategy } from '../drawing/policy'
import { UnownedColorStrategy } from '../image/model'
import { FillDirection, ImageStrategy, RegionOrder } from '../ordering'

import { type LoadedBot, type LoadedImage, SAVE_VERSION } from './schema'

/** Every field some version of the save format has had */
type Fields = Record<string, unknown> & {
  version?: unknown
  pixels?: unknown
  url?: unknown
  width?: unknown
  brightness?: unknown
  position?: unknown
  opacity?: unknown
  drawTransparentPixels?: unknown
  drawColorsInOrder?: unknown
  lock?: unknown
  disabled?: unknown
  wplaceId?: unknown
  floodFill?: unknown
  regionOrder?: unknown
  images?: unknown
  strategy?: unknown
  dropletStrategy?: unknown
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function versionOf(fields: Fields) {
  return typeof fields.version === 'number' ? fields.version : 0
}

/** How to migrate save data for images */
export function migrateImage(old: unknown): LoadedImage {
  if (!isFields(old)) throw new Error('Saved image is not an object')
  let image = old
  if (versionOf(image) < 3) {
    const pixels = isFields(image.pixels) ? image.pixels : {}
    image = {
      url: pixels.url,
      width: pixels.width,
      height: undefined,
      brightness: pixels.brightness,
      colorMetric: 'lab',
      position: image.position,
      strategy: ImageStrategy.SPIRAL_TO_CENTER,
      opacity: image.opacity,
      drawTransparentPixels: image.drawTransparentPixels,
      drawColorsInOrder: image.drawColorsInOrder,
      colors: [],
      disabledColors: [],
      lock: image.lock,
      disabled: false,
      name: `Unnamed image`,
      unownedColorStrategy: UnownedColorStrategy.BUY,
      wplaceId: undefined,
      version: 3,
    }
  }
  // `disabled` used to hold the site's visibility for imported templates.
  // It is the user's own switch now, so hand the old value to `siteDisabled`
  if (versionOf(image) < 4)
    image = {
      ...image,
      disabled: image.wplaceId ? false : Boolean(image.disabled),
      siteDisabled: image.wplaceId ? Boolean(image.disabled) : false,
      version: 4,
    }
  if (versionOf(image) < 5)
    image = {
      ...image,
      floodFill: false,
      regionOrder: 'NONE',
      fillDirection: FillDirection.SEED_OUT,
      outlineFirst: false,
      version: 5,
    }
  // The fill used to be a checkbox beside the order, now the order owns it
  if (versionOf(image) < 6) {
    const { floodFill, ...rest } = image
    image = {
      ...rest,
      regionOrder: floodFill
        ? rest.regionOrder === 'NONE'
          ? RegionOrder.IN_ORDER
          : rest.regionOrder
        : RegionOrder.OFF,
      version: 6,
    }
  }
  if (typeof image.url !== 'string')
    throw new Error('Saved image has no source url')
  return image as LoadedImage
}

/** How to migrate save data */
export function migrate(old: unknown): LoadedBot {
  if (!isFields(old)) throw new Error('Save is not an object')
  let save = old
  if (versionOf(save) < 3)
    save = {
      version: 3,
      images: save.images,
      strategy: save.strategy,
      title: 'WPlace-bot',
    }
  // Droplets used to go to colors only, and that stays the default
  if (versionOf(save) < 7)
    save = { ...save, dropletStrategy: DropletStrategy.COLORS, version: 7 }
  // "Charges only" is gone. Colors first keeps buying charges, and an image
  // that should never spend the balance on a color now says so on its own
  if (versionOf(save) < 8)
    save = {
      ...save,
      dropletStrategy:
        save.dropletStrategy === 'CHARGES'
          ? DropletStrategy.COLORS_FIRST
          : save.dropletStrategy,
      version: 8,
    }
  if (!Array.isArray(save.images)) throw new Error('Save has no image list')
  // Images carry their own version, so migrate them whatever the save says
  return {
    ...(save as Omit<LoadedBot, 'images'>),
    version: SAVE_VERSION,
    images: save.images.map(migrateImage),
  }
}
