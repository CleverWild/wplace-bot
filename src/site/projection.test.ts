import { expect, test } from 'bun:test'

import {
  latitudeToWorld,
  longitudeToWorld,
  worldToLatitude,
  worldToLongitude,
} from '../world-position'

import {
  fromViewportPosition,
  panToCentral,
  pixelCenterToViewport,
  toViewportPosition,
  type ProjectionMap,
} from './projection'

function mapAt(left: number, top: number, rotated = false): ProjectionMap {
  return {
    project: ([lng, lat]) => {
      const x = longitudeToWorld(lng)
      const y = latitudeToWorld(lat)
      return rotated ? { x: -y * 4, y: x * 4 } : { x: x * 4, y: y * 4 }
    },
    unproject: ([x, y]) => ({
      lng: worldToLongitude(rotated ? y / 4 : x / 4),
      lat: worldToLatitude(rotated ? -x / 4 : y / 4),
    }),
    getCanvas: () => ({ getBoundingClientRect: () => ({ left, top }) }),
  }
}

test('projects into viewport coordinates including the canvas offset', () => {
  const position = toViewportPosition(mapAt(100, 50), 1024000, 1024000)
  expect(position.x).toBeCloseTo(4096100, 6)
  expect(position.y).toBeCloseTo(4096050, 6)
})

test('removes the canvas offset before converting a viewport point to world pixels', () => {
  const position = fromViewportPosition(mapAt(100, 50), {
    x: 4096100,
    y: 4096050,
  })
  expect(position.globalX).toBeCloseTo(1024000, 6)
  expect(position.globalY).toBeCloseTo(1024000, 6)
})

test('preserves the full-screen zero-offset projection', () => {
  const position = toViewportPosition(mapAt(0, 0), 1024000, 1024000)
  expect(position).toEqual({ x: 4096000, y: 4096000 })
})

const SCREEN = { left: 0, top: 0, width: 1000, height: 800 }

test('leaves the map alone while the point is in the central half', () => {
  expect(panToCentral({ x: 500, y: 400 }, SCREEN, 0.5)).toBeUndefined()
  expect(panToCentral({ x: 750, y: 600 }, SCREEN, 0.5)).toBeUndefined()
  expect(panToCentral({ x: 250, y: 200 }, SCREEN, 0.5)).toBeUndefined()
})

test('pans the point to the middle once it leaves the central half', () => {
  expect(panToCentral({ x: 751, y: 400 }, SCREEN, 0.5)).toEqual({
    x: 251,
    y: 0,
  })
  expect(panToCentral({ x: 500, y: 100 }, SCREEN, 0.5)).toEqual({
    x: 0,
    y: -300,
  })
  expect(panToCentral({ x: -50, y: 900 }, SCREEN, 0.5)).toEqual({
    x: -550,
    y: 500,
  })
})

test('measures the central half from the canvas, not from the window origin', () => {
  const offset = { left: 100, top: 50, width: 1000, height: 800 }
  expect(panToCentral({ x: 600, y: 450 }, offset, 0.5)).toBeUndefined()
  expect(panToCentral({ x: 900, y: 450 }, offset, 0.5)).toEqual({
    x: 300,
    y: 0,
  })
})

test('projects the pixel center in world coordinates when the camera is rotated', () => {
  const position = pixelCenterToViewport(mapAt(100, 50, true), 1024000, 1024000)
  expect(position.x).toBeCloseTo(-4095902, 6)
  expect(position.y).toBeCloseTo(4096052, 6)
})
