import { FillDirection, ImageStrategy, RegionOrder } from '../ordering'

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

export type DrawingSettings = {
  strategy: ImageStrategy
  drawTransparentPixels: boolean
  drawColorsInOrder: boolean
  colors: number[]
  disabledColors: Set<number>
  disabled: boolean
  unownedColorStrategy: UnownedColorStrategy
  regionOrder: RegionOrder
  fillDirection: FillDirection
  outlineFirst: boolean
}

export type ImageSettings = DrawingSettings

export function createImageSettings(
  overrides: Partial<DrawingSettings> = {},
): DrawingSettings {
  const settings: DrawingSettings = {
    strategy: ImageStrategy.SPIRAL_TO_CENTER,
    drawTransparentPixels: false,
    drawColorsInOrder: true,
    colors: [],
    disabledColors: new Set<number>(),
    disabled: false,
    unownedColorStrategy: UnownedColorStrategy.BUY,
    regionOrder: RegionOrder.OFF,
    fillDirection: FillDirection.SEED_OUT,
    outlineFirst: false,
  }
  for (const key of Object.keys(settings) as (keyof DrawingSettings)[]) {
    const value = overrides[key]
    if (value !== undefined) Object.assign(settings, { [key]: value })
  }
  settings.colors = [...settings.colors]
  settings.disabledColors = new Set(settings.disabledColors)
  return settings
}
