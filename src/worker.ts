import {
  type ColorMetric,
  COLORS,
  COLORS_RGB,
  COLORS_RGB_MAP,
  COLORS_RGB_TRIPLES,
  metricFunction,
  rgbToLab,
} from './colors'
import { type PixelColorStat, UnownedColorStrategy } from './image'
import {
  type FillDirection,
  floodOrder,
  type ImageStrategy,
  outlineFirstOrder,
  outlineMask,
  RegionOrder,
  strategyPosition,
} from './ordering'
import { WORLD_TILE_SIZE } from './world-position'

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

export type WokerErrorResponse = {
  id: number
  error: string
}

export type WorkerResponse =
  WorkerProgressResponse | WorkerPixelsResponse | WokerErrorResponse

self.onmessage = async (
  e: MessageEvent<WorkerPixelsRequest | 'CLEAR_MAP_CACHE'>,
) => {
  if (e.data === 'CLEAR_MAP_CACHE') mapsCache.clear()
  else {
    const data = e.data
    // Separated to not make pixels async. Better for performance
    await readMap(data.id, data.globalX, data.globalY, data.width, data.height)
    pixels(data)
  }
}

/** Main dish */
function pixels(request: WorkerPixelsRequest) {
  const {
    id,
    data,
    nativeWidth,
    nativeHeight,
    width,
    height,
    unavailableColors,
    brightness,
    colorMetric,
    colors,
    disabledColors,
    drawColorsInOrder,
    strategy,
    regionOrder,
    fillDirection,
    outlineFirst,
    unownedColorStrategy,
    globalX,
    globalY,
    drawTransparentPixels,
  } = request
  let lastProgress = 0

  // Scale
  let scaled
  if (nativeWidth === width && nativeHeight === height) scaled = data
  else {
    scaled = new Uint8ClampedArray(width * height * 4)
    const xRatio = nativeWidth / width
    const yRatio = nativeHeight / height
    for (let y = 0; y < height; y++) {
      const sy = Math.min(nativeHeight - 1, Math.floor(y * yRatio))
      for (let x = 0; x < width; x++) {
        const sx = Math.min(nativeWidth - 1, Math.floor(x * xRatio))
        const si = (sy * nativeWidth + sx) * 4
        const di = (y * width + x) * 4
        scaled[di] = data[si]!
        scaled[di + 1] = data[si + 1]!
        scaled[di + 2] = data[si + 2]!
        scaled[di + 3] = data[si + 3]!
      }
      const progress = ((y / height) * 5) | 0
      if (progress !== lastProgress) {
        lastProgress = progress
        sendProgress(id, 0.1 + progress / 100)
      }
    }
  }
  const SIZE = width * height
  const metricFn = metricFunction(colorMetric)
  const isRgbMetric = colorMetric === 'compuphase'
  const palette = isRgbMetric ? COLORS_RGB_TRIPLES : COLORS
  const pixels = new Uint8Array(SIZE)
  const isSubstitute = unownedColorStrategy === UnownedColorStrategy.SUBSTITUTE
  /** Colors before substitution, they key `colorStat` */
  const realPixels = isSubstitute ? new Uint8Array(SIZE) : pixels
  const colorStat = new Map<number, PixelColorStat>()
  const colorCache = new Map<number, [number, number]>()
  for (let index = 1; index < 64; index++)
    if (!unavailableColors.has(index))
      colorCache.set(COLORS_RGB[index]!, [index, index])

  let i = 0
  let pi = 0
  lastProgress = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const progress = ((pi / SIZE) * 75) | 0
      if (progress !== lastProgress) {
        lastProgress = progress
        sendProgress(id, 0.15 + progress / 100)
      }
      const r = scaled[i]!
      const g = scaled[i + 1]!
      const b = scaled[i + 2]!
      const a = scaled[i + 3]!
      const key = (r << 16) | (g << 8) | b
      let min!: number
      let minReal!: number
      // Transparent pixel
      if (a < 100) min = minReal = 0
      else if (colorCache.has(key)) [min, minReal] = colorCache.get(key)!
      else {
        // Find closest color. Converted once per pixel, not once per candidate
        const source: [number, number, number] = isRgbMetric
          ? [r, g, b]
          : rgbToLab(r, g, b)
        let minDelta = Infinity
        let minDeltaReal = Infinity
        for (let colorIndex = 1; colorIndex < 64; colorIndex++) {
          const delta = metricFn(source, palette[colorIndex]!, brightness)
          if (!unavailableColors.has(colorIndex) && delta < minDelta) {
            minDelta = delta
            min = colorIndex
          }
          if (delta < minDeltaReal) {
            minDeltaReal = delta
            minReal = colorIndex
          }
        }
        colorCache.set(key, [min, minReal])
      }
      pixels[pi] = isSubstitute ? min : minReal
      if (isSubstitute) realPixels[pi] = minReal
      const stat = colorStat.get(minReal)
      if (stat) stat.amount++
      else
        colorStat.set(minReal, {
          color: min,
          amount: 1,
          left: 0,
          realColor: minReal,
        })
      i += 4
      pi++
    }
  }

  // === Tasks ===

  // Colors
  const skipColors = new Set<number>()
  const colorsOrderMap = new Map<number, number>()
  for (let index = 0; index < colors.length; index++) {
    const drawColor = colors[index]!
    if (disabledColors.has(drawColor) || unavailableColors.has(drawColor))
      skipColors.add(drawColor)
    colorsOrderMap.set(drawColor, index)
  }
  const positions = strategyPosition(strategy, height, width)
  const tasks: { gx: number; gy: number; color: number; realColor: number }[] =
    []
  // Flood fill and outline both work on pixels, so keep the way back to tasks
  const floodFill = regionOrder !== RegionOrder.OFF
  const reorder = floodFill || outlineFirst
  const taskPixels = reorder ? new Uint32Array(SIZE) : undefined
  const taskOf = reorder ? new Int32Array(SIZE) : undefined
  lastProgress = 0
  for (let index = 0; index < positions.length; index += 2) {
    const progress = ((index / positions.length) * 10) | 0
    if (progress !== lastProgress) {
      lastProgress = progress
      sendProgress(id, 0.9 + progress / 100)
    }
    const dx = positions[index]!
    const dy = positions[index + 1]!
    const color = pixels[dy * width + dx]!

    const gx = globalX + dx
    const gy = globalY + dy
    const map = mapsCache.get(packTile(toTile(gx), toTile(gy)))!
    const mapColor = map[toTilePosition(gy) * 1000 + toTilePosition(gx)]

    if (color === mapColor) continue

    // Counted even for skipped colors, they are not painted, not done
    const realColor = realPixels[dy * width + dx]!
    colorStat.get(realColor)!.left++
    if (skipColors.has(color) || (!drawTransparentPixels && color === 0))
      continue

    tasks.push({
      gx,
      gy,
      color,
      realColor,
    })
    if (reorder) {
      const pixel = dy * width + dx
      taskPixels![tasks.length - 1] = pixel
      taskOf![pixel] = tasks.length - 1
    }
  }

  // Each pass is a stable reordering, so the last one applied wins ties:
  // outline phase beats color, which beats blob, which beats the strategy
  let ordered = tasks
  if (floodFill) {
    const order = floodOrder(
      taskPixels!.subarray(0, tasks.length),
      pixels,
      width,
      height,
      regionOrder,
      fillDirection,
    )
    ordered = Array.from({ length: order.length })
    for (let index = 0; index < order.length; index++)
      ordered[index] = tasks[taskOf![order[index]!]!]!
  }
  if (drawColorsInOrder)
    ordered.sort(
      (a, b) =>
        (colorsOrderMap.get(a.color) ?? 0) - (colorsOrderMap.get(b.color) ?? 0),
    )
  if (outlineFirst) {
    // Applied over what the color sort left, so an outline stays one line
    // instead of arriving color by color
    const current = new Uint32Array(ordered.length)
    for (let index = 0; index < ordered.length; index++) {
      const task = ordered[index]!
      current[index] = (task.gy - globalY) * width + (task.gx - globalX)
    }
    const order = outlineFirstOrder(current, outlineMask(pixels, width, height))
    const outlined: typeof tasks = Array.from({ length: order.length })
    for (let index = 0; index < order.length; index++)
      outlined[index] = tasks[taskOf![order[index]!]!]!
    ordered = outlined
  }

  // Sending
  const taskPositions = new Uint32Array(ordered.length * 2)
  for (let index = 0; index < ordered.length; index++) {
    const task = ordered[index]!
    const dIndex = index * 2
    taskPositions[dIndex] = task.gx
    taskPositions[dIndex + 1] = task.gy
  }
  postMessage(
    {
      id,
      taskPositions,
      colorStat,
      pixels,
    } satisfies WorkerPixelsResponse,
    [taskPositions.buffer, pixels.buffer],
  )
}

const mapsCache = new Map<number, Uint8Array>()
function readMap(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imagesToDownload = []
  const tileXEnd = toTile(x + width)
  const tileYEnd = toTile(y + height)
  const tileYStart = toTile(y)
  for (let tileX = toTile(x); tileX <= tileXEnd; tileX++)
    for (let tileY = tileYStart; tileY <= tileYEnd; tileY++)
      if (!mapsCache.has(packTile(tileX, tileY)))
        imagesToDownload.push({ tileX, tileY })

  let done = 0
  return Promise.all(
    [...imagesToDownload].map(async ({ tileX, tileY }) => {
      await updateMapPixels(tileX, tileY)
      done++
      sendProgress(id, (done / imagesToDownload.length) * 0.1)
      // this.widget.status = `⌛ Reading map [${++done}/${imagesToDownload.size}]`
    }),
  )
}

/** Fast fetch pixels for map */
async function updateMapPixels(tileX: number, tileY: number) {
  const res = await fetch(
    `https://backend.wplace.live/files/s0/tiles/${tileX}/${tileY}.png`,
  )
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
  const SIZE = bitmap.height * bitmap.width
  const pixels = new Uint8Array(SIZE)
  for (let i = 0, pi = 0; i < data.length; i += 4, pi++) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const a = data[i + 3]!
    const key = (r << 16) | (g << 8) | b
    pixels[pi] = a < 100 ? 0 : (COLORS_RGB_MAP.get(key) ?? 0)
  }
  mapsCache.set(packTile(tileX, tileY), pixels)
  return pixels
}

const packTile = (tileX: number, tileY: number) => (tileX << 11) | tileY
const toTile = (n: number) => (n / WORLD_TILE_SIZE) | 0
const toTilePosition = (n: number) => n % WORLD_TILE_SIZE
function sendProgress(id: number, progress: number) {
  postMessage({
    id,
    progress,
  })
}
