import { type ColorMetric } from '../colors'
import { type PixelColorStat, UnownedColorStrategy } from '../image/model'
import {
  type FillDirection,
  type ImageStrategy,
  type RegionOrder,
} from '../ordering'

export type WorkerPixelsRequest = {
  id: number
  data: Uint8ClampedArray
  nativeWidth: number
  nativeHeight: number
  width: number
  height: number
  unavailableColors: Set<number>
  brightness: number
  colorMetric: ColorMetric
  drawColorsInOrder: boolean
  colors: number[]
  disabledColors: Set<number>
  unownedColorStrategy: UnownedColorStrategy
  strategy: ImageStrategy
  regionOrder: RegionOrder
  fillDirection: FillDirection
  outlineFirst: boolean
  globalX: number
  globalY: number
  drawTransparentPixels: boolean
}

export type WorkerPixelsResponse = {
  id: number
  taskPositions: Uint32Array<ArrayBuffer>
  colorStat: Map<number, PixelColorStat>
  pixels: Uint8Array<ArrayBuffer>
}

export type WorkerProgressResponse = {
  id: number
  progress: number
}

export type WorkerErrorResponse = {
  id: number
  error: string
}

export type WorkerResponse =
  WorkerProgressResponse | WorkerPixelsResponse | WorkerErrorResponse
