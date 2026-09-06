import { expect, test } from 'bun:test'

import {
  contrastOrder,
  FillDirection,
  floodOrder,
  outlineFirstOrder,
  outlineMask,
  RegionOrder,
  sortColorsByAmount,
} from './ordering'

/** Row-major pixel grid, written out as rows for readability */
function grid(rows: number[][]) {
  const height = rows.length
  const width = rows[0]!.length
  const colorAt = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) colorAt[y * width + x] = rows[y]![x]!
  return { colorAt, width, height }
}

/** Every pixel is a task, in plain row-major order */
function allTasks(width: number, height: number) {
  const tasks = new Uint32Array(width * height)
  for (let index = 0; index < tasks.length; index++) tasks[index] = index
  return tasks
}

/** Connected same-color pixels must come out as one unbroken run */
function regionsAreContiguous(
  order: Uint32Array,
  colorAt: Uint8Array,
  width: number,
) {
  const seen = new Map<number, [number, number]>()
  const region = new Map<number, number>()
  // Label regions by flood fill, independently of the code under test
  let next = 0
  for (const start of order) {
    if (region.has(start)) continue
    const label = next++
    const stack = [start]
    region.set(start, label)
    while (stack.length > 0) {
      const pixel = stack.pop()!
      const x = pixel % width
      const y = (pixel / width) | 0
      for (const [nx, ny] of [
        [x, y - 1],
        [x - 1, y],
        [x + 1, y],
        [x, y + 1],
      ] as [number, number][]) {
        const neighbour = ny * width + nx
        if (nx < 0 || nx >= width || ny < 0) continue
        if (!order.includes(neighbour) || region.has(neighbour)) continue
        if (colorAt[neighbour] !== colorAt[pixel]) continue
        region.set(neighbour, label)
        stack.push(neighbour)
      }
    }
  }
  for (let index = 0; index < order.length; index++) {
    const label = region.get(order[index]!)!
    const span = seen.get(label)
    if (span) {
      if (span[1] !== index - 1) return false
      span[1] = index
    } else seen.set(label, [index, index])
  }
  return true
}

test('keeps every task exactly once', () => {
  const { colorAt, width, height } = grid([
    [1, 1, 2],
    [1, 1, 2],
    [2, 2, 2],
  ])
  const order = floodOrder(
    allTasks(width, height),
    colorAt,
    width,
    height,
    RegionOrder.IN_ORDER,
    FillDirection.SEED_OUT,
  )
  expect([...order].sort((a, b) => a - b)).toEqual([...allTasks(width, height)])
})

test('finishes a region before starting the next', () => {
  const { colorAt, width, height } = grid([
    [1, 1, 2],
    [1, 1, 2],
    [2, 2, 2],
  ])
  const order = floodOrder(
    allTasks(width, height),
    colorAt,
    width,
    height,
    RegionOrder.IN_ORDER,
    FillDirection.SEED_OUT,
  )
  expect(regionsAreContiguous(order, colorAt, width)).toBe(true)
  // The base order lands on the top-left region first, so it stays first
  expect([...order].slice(0, 4).sort((a, b) => a - b)).toEqual([0, 1, 3, 4])
})

test('does not join regions that only touch diagonally', () => {
  const { colorAt, width, height } = grid([
    [1, 2, 1],
    [2, 1, 2],
    [1, 2, 1],
  ])
  const order = floodOrder(
    allTasks(width, height),
    colorAt,
    width,
    height,
    RegionOrder.IN_ORDER,
    FillDirection.SEED_OUT,
  )
  // Every pixel is its own region, so nothing is allowed to move
  expect([...order]).toEqual([...allTasks(width, height)])
})

test('treats a hole as a region of its own', () => {
  const { colorAt, width, height } = grid([
    [1, 1, 1],
    [1, 2, 1],
    [1, 1, 1],
  ])
  const order = floodOrder(
    allTasks(width, height),
    colorAt,
    width,
    height,
    RegionOrder.IN_ORDER,
    FillDirection.SEED_OUT,
  )
  // The ring is finished before the pixel it encloses
  expect(order[8]).toBe(4)
})

test('orders regions by size, biggest or smallest first', () => {
  const { colorAt, width, height } = grid([
    [1, 1, 2],
    [1, 1, 2],
    [2, 2, 2],
  ])
  const tasks = allTasks(width, height)
  const biggest = floodOrder(
    tasks,
    colorAt,
    width,
    height,
    RegionOrder.LARGEST,
    FillDirection.SEED_OUT,
  )
  // The five 2s outnumber the four 1s
  expect([...biggest].slice(0, 5).every((p) => colorAt[p] === 2)).toBe(true)
  const smallest = floodOrder(
    tasks,
    colorAt,
    width,
    height,
    RegionOrder.SMALLEST,
    FillDirection.SEED_OUT,
  )
  expect([...smallest].slice(0, 4).every((p) => colorAt[p] === 1)).toBe(true)
})

test('keeps regions of equal size in the order they were met', () => {
  const { colorAt, width, height } = grid([
    [1, 2],
    [1, 2],
  ])
  const order = floodOrder(
    allTasks(width, height),
    colorAt,
    width,
    height,
    RegionOrder.LARGEST,
    FillDirection.SEED_OUT,
  )
  expect(order[0]).toBe(0)
})

test('fills a region from its edge inward', () => {
  const { colorAt, width, height } = grid([
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
  ])
  const order = floodOrder(
    allTasks(width, height),
    colorAt,
    width,
    height,
    RegionOrder.IN_ORDER,
    FillDirection.EDGE_IN,
  )
  // The middle is the furthest from any edge, so it goes last
  expect(order.at(-1)).toBe(12)
  // The outer ring of sixteen comes before anything else
  const ring = new Set([...order].slice(0, 16))
  expect(ring.has(6)).toBe(false)
})

test('marks the pixels that touch transparency', () => {
  const { colorAt, width, height } = grid([
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 2, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
  ])
  const outline = outlineMask(colorAt, width, height)
  // The ring of ones is the silhouette
  for (const pixel of [6, 7, 8, 11, 13, 16, 17, 18])
    expect(outline[pixel]).toBe(1)
  // The middle is a different color, but nothing transparent touches it
  expect(outline[12]).toBe(0)
  // Transparency is not part of the drawing, so it is never outline
  expect(outline[0]).toBe(0)
})

test('leaves color boundaries deep inside the drawing for later', () => {
  const { colorAt, width, height } = grid([
    [0, 0, 0, 0, 0, 0],
    [0, 1, 2, 3, 4, 0],
    [0, 5, 6, 7, 8, 0],
    [0, 9, 1, 2, 3, 0],
    [0, 4, 5, 6, 7, 0],
    [0, 0, 0, 0, 0, 0],
  ])
  const outline = outlineMask(colorAt, width, height)
  // Every neighbour differs everywhere here, yet the middle is not an outline
  for (const pixel of [14, 15, 20, 21]) expect(outline[pixel]).toBe(0)
  expect([...outline].filter((x) => x === 1)).toHaveLength(12)
})

test('catches an outline drawn in several colors whole', () => {
  const { colorAt, width, height } = grid([
    [0, 0, 0, 0, 0],
    [0, 3, 4, 3, 0],
    [0, 4, 5, 4, 0],
    [0, 3, 4, 3, 0],
    [0, 0, 0, 0, 0],
  ])
  const outline = outlineMask(colorAt, width, height)
  // Both shades of the ring are outline, none of it is left for later
  for (const pixel of [6, 7, 8, 11, 13, 16, 17, 18])
    expect(outline[pixel]).toBe(1)
  expect(outline[12]).toBe(0)
})

test('treats the image edge as an edge of the drawing', () => {
  const { colorAt, width, height } = grid([
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ])
  const outline = outlineMask(colorAt, width, height)
  expect(outline[4]).toBe(0)
  expect([...outline].filter((x) => x === 1)).toHaveLength(8)
})

test('draws the outline before the fill, keeping the order within each phase', () => {
  const outline = new Uint8Array([1, 0, 1, 0])
  const order = outlineFirstOrder(new Uint32Array([3, 2, 1, 0]), outline)
  expect([...order]).toEqual([2, 0, 3, 1])
})

test('sorts colors by how much of the image they cover', () => {
  const amounts = new Map([
    [1, 10],
    [2, 30],
    [3, 20],
  ])
  expect(sortColorsByAmount([1, 2, 3], amounts, false)).toEqual([2, 3, 1])
  expect(sortColorsByAmount([1, 2, 3], amounts, true)).toEqual([1, 3, 2])
})

test('leaves colors with equal counts where they were', () => {
  const amounts = new Map([
    [1, 5],
    [2, 5],
  ])
  expect(sortColorsByAmount([2, 1], amounts, false)).toEqual([2, 1])
})

/**
 * Distances of |a - b| * 10 between the few colors the tests use, and 100
 * against blank, which makes 100 the largest distance in the table.
 */
function distances() {
  const table = new Float64Array(64 * 64)
  for (let a = 1; a <= 4; a++)
    for (let b = 1; b <= 4; b++) table[a * 64 + b] = Math.abs(a - b) * 10
  for (let index = 1; index < 64; index++) {
    table[index] = 100
    table[index * 64] = 100
  }
  return table
}

test('paints what changes the picture most, first', () => {
  const { colorAt, width, height } = grid([[1, 2, 3]])
  const map = new Uint8Array([1, 1, 1])
  const order = contrastOrder(
    allTasks(width, height),
    colorAt,
    map,
    width,
    height,
    distances(),
  )
  // Pixel 2 is three steps away from what is under it, pixel 0 is already right
  expect([...order]).toEqual([2, 1, 0])
})

test('grows from what it has painted instead of jumping', () => {
  const { colorAt, width, height } = grid([[2, 2, 1, 2, 2]])
  const map = new Uint8Array([1, 1, 1, 1, 1])
  const order = contrastOrder(
    allTasks(width, height),
    colorAt,
    map,
    width,
    height,
    distances(),
  )
  // All four twos are worth the same at the start, so the base order decides
  expect(order[0]).toBe(0)
  // Its neighbour now carries the adhesion bonus and beats the far-away pair
  expect(order[1]).toBe(1)
})

test('keeps every task exactly once and touches nothing else', () => {
  const { colorAt, width, height } = grid([
    [1, 2, 3, 1],
    [2, 3, 1, 2],
    [3, 1, 2, 3],
  ])
  const map = new Uint8Array(width * height).fill(1)
  // Only the middle row is left to paint
  const tasks = new Uint32Array([4, 5, 6, 7])
  const order = contrastOrder(tasks, colorAt, map, width, height, distances())
  expect([...order].sort((a, b) => a - b)).toEqual([4, 5, 6, 7])
})

test('counts neighbours that are not tasks as part of the surroundings', () => {
  const { colorAt, width, height } = grid([[1, 2, 1]])
  // The map already matches at both ends, so only the middle is a task
  const map = new Uint8Array([1, 1, 1])
  const order = contrastOrder(
    new Uint32Array([1]),
    colorAt,
    map,
    width,
    height,
    distances(),
  )
  expect([...order]).toEqual([1])
})
