import { expect, test } from 'bun:test'

import {
  latitudeToWorld,
  longitudeToWorld,
  pixelSizeForZoom,
  WORLD_PIXEL_SIZE,
  worldToLatitude,
  worldToLongitude,
  zoomForPixelSize,
} from './world-position'

test('longitude survives a roundtrip through world coordinates', () => {
  expect(longitudeToWorld(worldToLongitude(1_037_359))).toBeCloseTo(
    1_037_359,
    6,
  )
})

test('latitude survives a roundtrip through world coordinates', () => {
  expect(latitudeToWorld(worldToLatitude(704_595))).toBeCloseTo(704_595, 6)
})

test('world coordinates start at the corner of the mercator square', () => {
  expect(worldToLongitude(0)).toBeCloseTo(-180, 10)
  expect(worldToLongitude(WORLD_PIXEL_SIZE / 2)).toBeCloseTo(0, 10)
  expect(worldToLatitude(WORLD_PIXEL_SIZE / 2)).toBeCloseTo(0, 10)
})

test('pixel size matches what maplibre measured on wplace', () => {
  // Measured on the live site: at this zoom project() put two points 100 map
  // pixels apart 643.3607412283278 screen pixels apart.
  expect(pixelSizeForZoom(14.651_412_188_068_154)).toBeCloseTo(
    6.433_607_412_271_661_6,
    9,
  )
})

test('zoom and pixel size are inverses of each other', () => {
  expect(zoomForPixelSize(pixelSizeForZoom(17.25))).toBeCloseTo(17.25, 10)
  expect(pixelSizeForZoom(zoomForPixelSize(4))).toBeCloseTo(4, 10)
})
