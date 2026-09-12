export type Position = {
  x: number
  y: number
}

export const WORLD_TILE_SIZE = 1000
export const WORLD_TILES = 2048
export const WORLD_PIXEL_SIZE = WORLD_TILE_SIZE * WORLD_TILES

/** Web mercator, the projection wplace's map uses */
export function worldToLatitude(y: number) {
  return (
    ((2 *
      Math.atan(Math.exp(-((y / WORLD_PIXEL_SIZE) * (2 * Math.PI) - Math.PI))) -
      Math.PI / 2) *
      180) /
    Math.PI
  )
}

export function worldToLongitude(x: number) {
  return (((x / WORLD_PIXEL_SIZE) * (2 * Math.PI) - Math.PI) * 180) / Math.PI
}

export function latitudeToWorld(latitude: number) {
  return (
    ((-Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 180 / 2)) +
      Math.PI) /
      (2 * Math.PI)) *
    WORLD_PIXEL_SIZE
  )
}

export function longitudeToWorld(longitude: number) {
  return (
    (((longitude * Math.PI) / 180 + Math.PI) / (2 * Math.PI)) * WORLD_PIXEL_SIZE
  )
}

/**
 * Screen pixels one map pixel takes at this zoom. maplibre lays the world out
 * in 512px tiles, wplace in 2048 tiles of 1000px, so the two scales meet here.
 */
export function pixelSizeForZoom(zoom: number) {
  return (512 * 2 ** zoom) / WORLD_PIXEL_SIZE
}

/** Zoom at which one map pixel takes `pixelSize` screen pixels */
export function zoomForPixelSize(pixelSize: number) {
  return Math.log2((pixelSize * WORLD_PIXEL_SIZE) / 512)
}
