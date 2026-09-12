import { expect, test } from 'bun:test'

import {
  latitudeToWorld,
  longitudeToWorld,
  worldToLatitude,
  worldToLongitude,
} from '../world-position'

import {
  fromViewportPosition,
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

test('projects the pixel center in world coordinates when the camera is rotated', () => {
  const position = pixelCenterToViewport(mapAt(100, 50, true), 1024000, 1024000)
  expect(position.x).toBeCloseTo(-4095902, 6)
  expect(position.y).toBeCloseTo(4096052, 6)
})
