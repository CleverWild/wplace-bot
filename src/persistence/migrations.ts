import { BotStrategy, DropletStrategy } from '../drawing/policy'
import { createImageSettings, UnownedColorStrategy } from '../image/model'
import { FillDirection, ImageStrategy, RegionOrder } from '../ordering'

import { type LoadedBot, SAVE_VERSION, type SavedImage } from './schema'

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
  widgetOpen?: unknown
  tileCountries?: unknown
  colors?: unknown
  disabledColors?: unknown
  unownedColorStrategy?: unknown
  fillDirection?: unknown
  outlineFirst?: unknown
  title?: unknown
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTileCountry(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function versionOf(fields: Fields) {
  return typeof fields.version === 'number' ? fields.version : 0
}

function migrateLegacyImage(old: unknown): Fields {
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
  return image
}

export function migrateImage(old: unknown, legacy = false): SavedImage {
  if (!isFields(old)) throw new Error('Saved image is not an object')
  const image = legacy ? migrateLegacyImage(old) : old
  if (typeof image.wplaceId !== 'string' || image.wplaceId.length === 0)
    throw new Error('Saved template has no Wplace ID')
  const defaults = createImageSettings()
  const colorList = (value: unknown): number[] =>
    Array.isArray(value)
      ? value.filter(
          (color): color is number =>
            typeof color === 'number' &&
            Number.isInteger(color) &&
            color >= 0 &&
            color < 64,
        )
      : []
  return {
    wplaceId: image.wplaceId,
    strategy: Object.values(ImageStrategy).includes(
      image.strategy as ImageStrategy,
    )
      ? (image.strategy as ImageStrategy)
      : defaults.strategy,
    drawTransparentPixels:
      typeof image.drawTransparentPixels === 'boolean'
        ? image.drawTransparentPixels
        : defaults.drawTransparentPixels,
    drawColorsInOrder:
      typeof image.drawColorsInOrder === 'boolean'
        ? image.drawColorsInOrder
        : defaults.drawColorsInOrder,
    colors: colorList(image.colors),
    disabledColors: colorList(image.disabledColors),
    disabled:
      typeof image.disabled === 'boolean' ? image.disabled : defaults.disabled,
    unownedColorStrategy: Object.values(UnownedColorStrategy).includes(
      image.unownedColorStrategy as UnownedColorStrategy,
    )
      ? (image.unownedColorStrategy as UnownedColorStrategy)
      : defaults.unownedColorStrategy,
    regionOrder: Object.values(RegionOrder).includes(
      image.regionOrder as RegionOrder,
    )
      ? (image.regionOrder as RegionOrder)
      : defaults.regionOrder,
    fillDirection: Object.values(FillDirection).includes(
      image.fillDirection as FillDirection,
    )
      ? (image.fillDirection as FillDirection)
      : defaults.fillDirection,
    outlineFirst:
      typeof image.outlineFirst === 'boolean'
        ? image.outlineFirst
        : defaults.outlineFirst,
  }
}

export function migrate(old: unknown): LoadedBot {
  if (!isFields(old)) throw new Error('Save is not an object')
  if (versionOf(old) > SAVE_VERSION)
    throw new Error('Save version is newer than this bot')
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
  if (versionOf(save) < 9) save = { ...save, widgetOpen: true, version: 9 }
  if (versionOf(save) < 10) save = { ...save, tileCountries: [], version: 10 }
  if (!Array.isArray(save.images)) throw new Error('Save has no image list')
  const images: SavedImage[] = []
  const seen = new Set<string>()
  let archivedImageCount = 0
  for (const image of save.images) {
    if (
      versionOf(old) < 11 &&
      (!isFields(image) ||
        typeof image.wplaceId !== 'string' ||
        !image.wplaceId)
    ) {
      archivedImageCount++
      continue
    }
    const migrated = migrateImage(image, versionOf(old) < 11)
    if (!seen.has(migrated.wplaceId)) {
      seen.add(migrated.wplaceId)
      images.push(migrated)
    }
  }
  return {
    version: SAVE_VERSION,
    images,
    strategy: Object.values(BotStrategy).includes(save.strategy as BotStrategy)
      ? (save.strategy as BotStrategy)
      : BotStrategy.ALL,
    dropletStrategy: Object.values(DropletStrategy).includes(
      save.dropletStrategy as DropletStrategy,
    )
      ? (save.dropletStrategy as DropletStrategy)
      : DropletStrategy.COLORS,
    title: typeof save.title === 'string' ? save.title : 'WPlace-bot',
    widgetOpen: typeof save.widgetOpen === 'boolean' ? save.widgetOpen : true,
    ...(archivedImageCount > 0 ? { archivedImageCount } : {}),
    tileCountries: Array.isArray(save.tileCountries)
      ? save.tileCountries.filter(isTileCountry)
      : [],
  }
}
