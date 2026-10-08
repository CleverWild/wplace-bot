import { expect, test } from 'bun:test'

import { type WPlaceBot } from './bot'
import {
  latitudeToWorld,
  longitudeToWorld,
  pixelSizeForZoom,
  WORLD_PIXEL_SIZE,
  WorldPosition,
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

for (const [width, height, left, top, devicePixelRatio] of [
  [1920, 1080, 0, 0, 1],
  [2560, 1440, 0, 0, 1],
  [1707, 960, 0, 0, 1.5],
  [2240, 1320, 320, 120, 2],
] as const) {
  test(`centers the art on a ${width}x${height} map at ${left},${top}, DPR ${devicePixelRatio}`, () => {
    let center: [number, number] = [0, 0]
    const jumps: unknown[] = []
    const bot = {
      map: {
        jumpTo: (options: { center: [number, number] }) => {
          center = options.center
          jumps.push(options)
        },
        getCanvas: () => ({
          width: width * devicePixelRatio,
          height: height * devicePixelRatio,
          getBoundingClientRect: () => ({ left, top, width, height }),
        }),
        project: ([lng, lat]: [number, number]) => ({
          x:
            width / 2 +
            (longitudeToWorld(lng) - longitudeToWorld(center[0])) * 4,
          y:
            height / 2 +
            (latitudeToWorld(lat) - latitudeToWorld(center[1])) * 4,
        }),
      },
    } as unknown as WPlaceBot
    const position = new WorldPosition(bot, 1_078_206, 704_428)
    position.moveScreenTo(93, 125)
    const artCenter = new WorldPosition(
      bot,
      1_078_206 + 93 / 2,
      704_428 + 125 / 2,
    )
    const screen = artCenter.toScreenPosition()
    expect(screen.x).toBeCloseTo(left + width / 2, 6)
    expect(screen.y).toBeCloseTo(top + height / 2, 6)
    expect(jumps).toEqual([
      {
        center: [
          worldToLongitude(artCenter.globalX),
          worldToLatitude(artCenter.globalY),
        ],
        zoom: zoomForPixelSize(
          Math.min((width * 0.8) / 93, (height * 0.8) / 125),
        ),
      },
    ])
    expect(position.toJSON()).toEqual([1_078_206, 704_428])
  })
}

test('fits and centers a one-pixel world position', () => {
  const jumps: unknown[] = []
  const bot = {
    map: {
      jumpTo: (options: unknown) => jumps.push(options),
      getCanvas: () => ({
        getBoundingClientRect: () => ({ width: 2560, height: 1080 }),
      }),
    },
  } as unknown as WPlaceBot
  new WorldPosition(bot, 1_078_206, 704_428).moveScreenTo(1, 1)
  expect(jumps).toEqual([
    {
      center: [worldToLongitude(1_078_206.5), worldToLatitude(704_428.5)],
      zoom: zoomForPixelSize(Math.min(2048, 864)),
    },
  ])
})
