/**
 * How tasks are ordered on the way to the canvas. Kept free of DOM and
 * storage imports so the ordering can be tested on its own.
 */

export enum ImageStrategy {
  RANDOM = 'RANDOM',
  DOWN = 'DOWN',
  UP = 'UP',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  SPIRAL_FROM_CENTER = 'SPIRAL_FROM_CENTER',
  SPIRAL_TO_CENTER = 'SPIRAL_TO_CENTER',
}

/**
 * Whether blobs are filled at all, and which one goes first once the strategy
 * has met them all. `OFF` leaves the order the strategy produced alone.
 */
export enum RegionOrder {
  OFF = 'OFF',
  IN_ORDER = 'IN_ORDER',
  LARGEST = 'LARGEST',
  SMALLEST = 'SMALLEST',
}

/** How a single blob is filled in */
export enum FillDirection {
  SEED_OUT = 'SEED_OUT',
  EDGE_IN = 'EDGE_IN',
}

/** Returns array there index*2=x, index*2+1=y */
export function strategyPosition(
  strategy: ImageStrategy,
  height: number,
  width: number,
) {
  const SIZE = width * height
  const result = new Uint16Array(SIZE * 2) // Max 65535
  let index = 0
  switch (strategy) {
    case ImageStrategy.DOWN: {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          result[index] = x
          result[index + 1] = y
          index += 2
        }
      break
    }
    case ImageStrategy.UP: {
      for (let y = height - 1; y >= 0; y--)
        for (let x = 0; x < width; x++) {
          result[index] = x
          result[index + 1] = y
          index += 2
        }
      break
    }
    case ImageStrategy.LEFT: {
      for (let x = 0; x < width; x++)
        for (let y = 0; y < height; y++) {
          result[index] = x
          result[index + 1] = y
          index += 2
        }
      break
    }
    case ImageStrategy.RIGHT: {
      for (let x = width - 1; x >= 0; x--)
        for (let y = 0; y < height; y++) {
          result[index] = x
          result[index + 1] = y
          index += 2
        }
      break
    }
    case ImageStrategy.RANDOM: {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          result[index] = x
          result[index + 1] = y
          index += 2
        }
      for (let index = SIZE - 1; index >= 0; index--) {
        const randIndex = Math.floor(Math.random() * (index + 1)) * 2
        const realIndex = index * 2
        const temporaryX = result[realIndex]!
        const temporaryY = result[realIndex + 1]!
        result[realIndex] = result[randIndex]!
        result[realIndex + 1] = result[randIndex + 1]!
        result[randIndex] = temporaryX
        result[randIndex + 1] = temporaryY
      }
      break
    }

    case ImageStrategy.SPIRAL_FROM_CENTER:
    case ImageStrategy.SPIRAL_TO_CENTER: {
      const reverse = strategy === ImageStrategy.SPIRAL_FROM_CENTER
      let idx = reverse ? SIZE - 1 : 0
      const step = reverse ? -1 : 1

      let top = 0,
        bottom = height - 1,
        left = 0,
        right = width - 1

      while (top <= bottom && left <= right) {
        for (let x = left; x <= right; x++) {
          result[idx * 2] = x
          result[idx * 2 + 1] = top
          idx += step
        }
        top++
        for (let y = top; y <= bottom; y++) {
          result[idx * 2] = right
          result[idx * 2 + 1] = y
          idx += step
        }
        right--
        if (top <= bottom) {
          for (let x = right; x >= left; x--) {
            result[idx * 2] = x
            result[idx * 2 + 1] = bottom
            idx += step
          }
          bottom--
        }
        if (left <= right) {
          for (let y = bottom; y >= top; y--) {
            result[idx * 2] = left
            result[idx * 2 + 1] = y
            idx += step
          }
          left++
        }
      }
      break
    }
  }
  return result
}

/**
 * Regroups tasks so a blob of one color is finished before the next one is
 * started, the way a person fills an area in before moving the brush away.
 * Blobs are 4-connected and made of tasks only: half a shape already on the
 * map is not part of the shape that is left to paint.
 */
export function floodOrder(
  taskPixels: Uint32Array,
  colorAt: Uint8Array,
  width: number,
  height: number,
  regionOrder: RegionOrder,
  fillDirection: FillDirection,
) {
  const SIZE = width * height
  const LENGTH = taskPixels.length
  const isTask = new Uint8Array(SIZE)
  for (let index = 0; index < LENGTH; index++) isTask[taskPixels[index]!] = 1
  const visited = new Uint8Array(SIZE)
  const result = new Uint32Array(LENGTH)
  const queue = new Uint32Array(LENGTH)
  /** Where every blob sits inside `result` */
  const regionStarts: number[] = []
  const regionLengths: number[] = []
  // Blob membership and ring marks, stamped per blob so nothing needs clearing
  const member = new Int32Array(SIZE).fill(-1)
  const layered = new Int32Array(SIZE).fill(-1)
  const scratch = new Uint32Array(LENGTH)
  let out = 0

  for (let index = 0; index < LENGTH; index++) {
    const seed = taskPixels[index]!
    if (visited[seed] === 1) continue
    const color = colorAt[seed]!
    const start = out
    const region = regionStarts.length
    let head = 0
    let tail = 0
    queue[tail++] = seed
    visited[seed] = 1
    while (head < tail) {
      const pixel = queue[head++]!
      result[out++] = pixel
      member[pixel] = region
      const x = pixel % width
      const y = (pixel / width) | 0
      // Up, left, right, down
      if (y > 0) {
        const next = pixel - width
        if (
          visited[next] === 0 &&
          isTask[next] === 1 &&
          colorAt[next] === color
        ) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
      if (x > 0) {
        const next = pixel - 1
        if (
          visited[next] === 0 &&
          isTask[next] === 1 &&
          colorAt[next] === color
        ) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
      if (x < width - 1) {
        const next = pixel + 1
        if (
          visited[next] === 0 &&
          isTask[next] === 1 &&
          colorAt[next] === color
        ) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
      if (y < height - 1) {
        const next = pixel + width
        if (
          visited[next] === 0 &&
          isTask[next] === 1 &&
          colorAt[next] === color
        ) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
    }
    regionStarts.push(start)
    regionLengths.push(out - start)
    if (fillDirection === FillDirection.EDGE_IN)
      layerRegion(
        result,
        scratch,
        queue,
        member,
        layered,
        region,
        start,
        out,
        width,
        height,
      )
  }

  if (regionOrder === RegionOrder.IN_ORDER) return result

  // Stable, so blobs of the same size keep the order the strategy met them in
  const order = regionStarts.map((_, index) => index)
  order.sort((a, b) =>
    regionOrder === RegionOrder.LARGEST
      ? regionLengths[b]! - regionLengths[a]!
      : regionLengths[a]! - regionLengths[b]!,
  )
  const sorted = new Uint32Array(LENGTH)
  let write = 0
  for (let index = 0; index < order.length; index++) {
    const region = order[index]!
    const start = regionStarts[region]!
    const end = start + regionLengths[region]!
    for (let read = start; read < end; read++) sorted[write++] = result[read]!
  }
  return sorted
}

/**
 * Rewrites one blob in `result` as rings, from its border towards the middle.
 * The image border counts as a border of the blob: nothing lies beyond it.
 */
function layerRegion(
  result: Uint32Array,
  scratch: Uint32Array,
  queue: Uint32Array,
  member: Int32Array,
  layered: Int32Array,
  region: number,
  start: number,
  end: number,
  width: number,
  height: number,
) {
  for (let index = start; index < end; index++) scratch[index] = result[index]!
  let head = 0
  let tail = 0
  for (let index = start; index < end; index++) {
    const pixel = scratch[index]!
    const x = pixel % width
    const y = (pixel / width) | 0
    if (
      y === 0 ||
      member[pixel - width] !== region ||
      x === 0 ||
      member[pixel - 1] !== region ||
      x === width - 1 ||
      member[pixel + 1] !== region ||
      y === height - 1 ||
      member[pixel + width] !== region
    ) {
      layered[pixel] = region
      queue[tail++] = pixel
    }
  }
  let write = start
  while (head < tail) {
    const pixel = queue[head++]!
    result[write++] = pixel
    const x = pixel % width
    const y = (pixel / width) | 0
    if (y > 0) {
      const next = pixel - width
      if (member[next] === region && layered[next] !== region) {
        layered[next] = region
        queue[tail++] = next
      }
    }
    if (x > 0) {
      const next = pixel - 1
      if (member[next] === region && layered[next] !== region) {
        layered[next] = region
        queue[tail++] = next
      }
    }
    if (x < width - 1) {
      const next = pixel + 1
      if (member[next] === region && layered[next] !== region) {
        layered[next] = region
        queue[tail++] = next
      }
    }
    if (y < height - 1) {
      const next = pixel + width
      if (member[next] === region && layered[next] !== region) {
        layered[next] = region
        queue[tail++] = next
      }
    }
  }
}

/**
 * Marks the silhouette: pixels of the drawing that touch transparency or the
 * edge of the image. Blind to color, so an outline drawn in several shades is
 * caught whole; transparency itself is never part of it.
 *
 * Deliberately not "touches a different color": on anything with shading or
 * dithering that covers most of the picture, which makes the phase useless.
 */
export function outlineMask(
  colorAt: Uint8Array,
  width: number,
  height: number,
) {
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      if (colorAt[pixel] === 0) continue
      mask[pixel] =
        y === 0 ||
        colorAt[pixel - width] === 0 ||
        x === 0 ||
        colorAt[pixel - 1] === 0 ||
        x === width - 1 ||
        colorAt[pixel + 1] === 0 ||
        y === height - 1 ||
        colorAt[pixel + width] === 0
          ? 1
          : 0
    }
  return mask
}

/** Outline first, fill after, each phase keeping the order it came in */
export function outlineFirstOrder(
  taskPixels: Uint32Array,
  outline: Uint8Array,
) {
  const result = new Uint32Array(taskPixels.length)
  let write = 0
  for (let index = 0; index < taskPixels.length; index++) {
    const pixel = taskPixels[index]!
    if (outline[pixel] === 1) result[write++] = pixel
  }
  for (let index = 0; index < taskPixels.length; index++) {
    const pixel = taskPixels[index]!
    if (outline[pixel] === 0) result[write++] = pixel
  }
  return result
}

/**
 * Colors by how much of the image they cover. Sorted by the total and not by
 * what is left, so the order does not reshuffle itself as painting goes on.
 */
export function sortColorsByAmount(
  colors: number[],
  amounts: Map<number, number>,
  ascending: boolean,
) {
  return [...colors].sort((a, b) =>
    ascending
      ? (amounts.get(a) ?? 0) - (amounts.get(b) ?? 0)
      : (amounts.get(b) ?? 0) - (amounts.get(a) ?? 0),
  )
}
