import { type ColorMetric } from '../colors'
import { FillDirection, ImageStrategy, RegionOrder } from '../ordering'

/** What to do with colors that the account does not own */
export enum UnownedColorStrategy {
  BUY = 'BUY',
  SKIP = 'SKIP',
  SUBSTITUTE = 'SUBSTITUTE',
}

export type PixelColorStat = {
  color: number
  amount: number
  left: number
  realColor: number
}

export type ImageSettings = {
  /** Width of drawn image */
  width: number
  /** Independent drawn height. Unset follows the source aspect ratio */
  height?: number
  brightness: number
  /** Defaults to what wplace itself defaults to */
  colorMetric: ColorMetric
  /** Order of pixels to draw */
  strategy: ImageStrategy
  opacity: number
  /** Erase pixels where the image is transparent */
  drawTransparentPixels: boolean
  drawColorsInOrder: boolean
  colors: number[]
  /** Colors not to draw */
  disabledColors: Set<number>
  /** Stop accidental image edit */
  lock: boolean
  /** Disable this image from drawing and from counting toward totals */
  disabled: boolean
  name: string
  unownedColorStrategy: UnownedColorStrategy
  /**
   * Id of the wplace template this image mirrors.
   * The site owns everything it covers, so those controls are taken away
   * from the user and overwritten whenever the template changes.
   */
  wplaceId?: string
  /**
   * Visibility as the site last reported it. Kept apart from `disabled` so
   * switching a template off here is not undone by the next sync.
   */
  siteDisabled: boolean
  /** Whether blobs are filled in one at a time, and which one goes first */
  regionOrder: RegionOrder
  /** How a single blob is filled in */
  fillDirection: FillDirection
  /** The silhouette before everything it encloses */
  outlineFirst: boolean
}

/**
 * Undefined overrides keep the default, as the positional constructor
 * parameters did: old saves carry explicit undefined fields.
 */
export function createImageSettings(
  overrides: Partial<ImageSettings> = {},
): ImageSettings {
  const settings: ImageSettings = {
    width: 1,
    brightness: 0,
    colorMetric: 'lab',
    strategy: ImageStrategy.SPIRAL_TO_CENTER,
    opacity: 50,
    drawTransparentPixels: false,
    drawColorsInOrder: true,
    colors: [],
    disabledColors: new Set<number>(),
    lock: false,
    disabled: false,
    name: '',
    unownedColorStrategy: UnownedColorStrategy.BUY,
    siteDisabled: false,
    regionOrder: RegionOrder.OFF,
    fillDirection: FillDirection.SEED_OUT,
    outlineFirst: false,
  }
  for (const [key, value] of Object.entries(
    overrides as Record<string, unknown>,
  ))
    if (value !== undefined) Object.assign(settings, { [key]: value })
  settings.colors = [...settings.colors]
  settings.disabledColors = new Set(settings.disabledColors)
  return settings
}
