import { type BotStrategy, type DropletStrategy } from '../drawing/policy'
import { type DrawingSettings } from '../image/model'

export const SAVE_VERSION = 11

export type SavedImage = Omit<DrawingSettings, 'disabledColors'> & {
  wplaceId: string
  disabledColors: number[]
}

export type SavedBot = {
  version: number
  images: SavedImage[]
  strategy: BotStrategy
  dropletStrategy: DropletStrategy
  title: string
  widgetOpen: boolean
  /** `[tileKey, countryId]` pairs learned from wplace */
  tileCountries: [number, number][]
}

export type LoadedImage = SavedImage

export type LoadedBot = SavedBot & { archivedImageCount?: number }
