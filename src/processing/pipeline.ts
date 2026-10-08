import {
  type ColorMetric,
  COLORS,
  COLORS_RGB_TRIPLES,
  metricFunction,
} from '../colors'
import { type PixelColorStat, UnownedColorStrategy } from '../image/model'
import {
  contrastOrder,
  floodOrder,
  ImageStrategy,
  outlineFirstOrder,
  outlineMask,
  RegionOrder,
  strategyPosition,
} from '../ordering'

import { type WorkerPixelsRequest, type WorkerPixelsResponse } from './protocol'
import { packTile, toTile, toTilePosition } from './tiles'

export function calculatePixels(
  request: WorkerPixelsRequest,
  maps: ReadonlyMap<number, Uint8Array>,
  onProgress?: (p: number) => void,
): WorkerPixelsResponse {
  const {
    id,
    pixels: realPixels,
    width,
    height,
    unavailableColors,
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
  validatePixelsRequest(request)
  const SIZE = width * height
  const pixels = new Uint8Array(realPixels)
  const isSubstitute = unownedColorStrategy === UnownedColorStrategy.SUBSTITUTE
  const metricFn = metricFunction(colorMetric)
  const palette = colorMetric === 'compuphase' ? COLORS_RGB_TRIPLES : COLORS
  const replacements = new Map<number, number>()
  const colorStat = new Map<number, PixelColorStat>()
  let lastProgress = 0
  for (let index = 0; index < SIZE; index++) {
    const progress = ((index / SIZE) * 75) | 0
    if (progress !== lastProgress) {
      lastProgress = progress
      onProgress?.(0.15 + progress / 100)
    }
    const realColor = realPixels[index]!
    let color = realColor
    if (isSubstitute && realColor !== 0 && unavailableColors.has(realColor)) {
      const cached = replacements.get(realColor)
      if (cached !== undefined) color = cached
      else {
        let minDelta = Infinity
        for (let candidate = 1; candidate < 64; candidate++) {
          if (unavailableColors.has(candidate)) continue
          const delta = metricFn(palette[realColor]!, palette[candidate]!, 0)
          if (delta < minDelta) {
            minDelta = delta
            color = candidate
          }
        }
        if (minDelta === Infinity)
          throw new Error('No available replacement color')
        replacements.set(realColor, color)
      }
      pixels[index] = color
    }
    const stat = colorStat.get(realColor)
    if (stat) stat.amount++
    else colorStat.set(realColor, { color, amount: 1, left: 0, realColor })
  }

  const colorsOrderMap = new Map<number, number>()
  for (let index = 0; index < colors.length; index++)
    colorsOrderMap.set(colors[index]!, index)
  const positions = strategyPosition(strategy, height, width)
  const tasks: { gx: number; gy: number; color: number; realColor: number }[] =
    []
  // Flood fill, contrast and outline all work on pixels, so keep the way back
  const contrast = strategy === ImageStrategy.CONTRAST
  const floodFill = regionOrder !== RegionOrder.OFF
  const reorder = contrast || floodFill || outlineFirst
  const taskPixels = reorder ? new Uint32Array(SIZE) : undefined
  const taskOf = reorder ? new Int32Array(SIZE) : undefined
  // Neighbours of a task are not always tasks themselves
  const mapAt = contrast ? new Uint8Array(SIZE) : undefined
  lastProgress = 0
  for (let index = 0; index < positions.length; index += 2) {
    const progress = ((index / positions.length) * 10) | 0
    if (progress !== lastProgress) {
      lastProgress = progress
      onProgress?.(0.9 + progress / 100)
    }
    const dx = positions[index]!
    const dy = positions[index + 1]!
    const color = pixels[dy * width + dx]!

    const gx = globalX + dx
    const gy = globalY + dy
    const map = maps.get(packTile(toTile(gx), toTile(gy)))!
    const mapColor = map[toTilePosition(gy) * 1000 + toTilePosition(gx)]

    if (contrast) mapAt![dy * width + dx] = mapColor ?? 0
    if (color === mapColor) continue

    // Counted even for skipped colors, they are not painted, not done
    const realColor = realPixels[dy * width + dx]!
    colorStat.get(realColor)!.left++
    if (
      disabledColors.has(realColor) ||
      unavailableColors.has(color) ||
      (!drawTransparentPixels && color === 0)
    )
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
  // outline phase beats color, which beats blob, which beats the base order
  let ordered = tasks
  if (contrast || floodFill) {
    let order = taskPixels!.subarray(0, tasks.length)
    if (contrast)
      order = contrastOrder(
        order,
        pixels,
        mapAt!,
        width,
        height,
        contrastDistances(colorMetric),
      )
    if (floodFill)
      order = floodOrder(
        order,
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
        (colorsOrderMap.get(a.realColor) ?? 0) -
        (colorsOrderMap.get(b.realColor) ?? 0),
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

  const taskPositions = new Uint32Array(ordered.length * 2)
  for (let index = 0; index < ordered.length; index++) {
    const task = ordered[index]!
    const dIndex = index * 2
    taskPositions[dIndex] = task.gx
    taskPositions[dIndex + 1] = task.gy
  }
  return {
    id,
    taskPositions,
    colorStat,
    pixels,
  }
}

export function validatePixelsRequest(
  request: Pick<WorkerPixelsRequest, 'pixels' | 'width' | 'height'>,
) {
  const { pixels, width, height } = request
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !(pixels instanceof Uint8Array) ||
    pixels.length !== width * height
  )
    throw new Error('Template pixel dimensions do not match its indexed image')
  for (let index = 0; index < pixels.length; index++)
    if (pixels[index]! >= 64)
      throw new Error('Template contains an invalid palette index')
}

/**
 * Every palette color against every other, by the metric the image is set to.
 * Blank canvas gets the largest distance in the table: we cannot know what is
 * under an unpainted tile, and putting the first pixel there is the most
 * visible thing that can happen.
 */
function contrastDistances(colorMetric: ColorMetric) {
  const metricFn = metricFunction(colorMetric)
  const palette = colorMetric === 'compuphase' ? COLORS_RGB_TRIPLES : COLORS
  const table = new Float64Array(64 * 64)
  let max = 0
  for (let a = 1; a < 64; a++)
    for (let b = 1; b < 64; b++) {
      const delta = metricFn(palette[a]!, palette[b]!, 0)
      table[a * 64 + b] = delta
      if (delta > max) max = delta
    }
  for (let index = 1; index < 64; index++) {
    table[index] = max
    table[index * 64] = max
  }
  return table
}
