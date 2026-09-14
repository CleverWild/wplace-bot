import { type BotStrategy, type DropletStrategy } from '../drawing/policy'
import { type ImageSettings } from '../image/model'

export const SAVE_VERSION = 9

export type SavedImage = Omit<ImageSettings, 'disabledColors'> & {
  url: string
  /** Top-left corner in world pixels */
  position: readonly [number, number]
  disabledColors: number[]
  version: number
}

export type SavedBot = {
  version: number
  images: SavedImage[]
  strategy: BotStrategy
  dropletStrategy: DropletStrategy
  title: string
  widgetOpen: boolean
}

/**
 * A migrated image. Saves older than the current fields leave them out, and
 * image creation fills them from defaults and the source image size.
 */
export type LoadedImage = Pick<SavedImage, 'url'> & Partial<SavedImage>

export type LoadedBot = Omit<SavedBot, 'images'> & { images: LoadedImage[] }
