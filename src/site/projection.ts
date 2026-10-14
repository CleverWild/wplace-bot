import {
  latitudeToWorld,
  longitudeToWorld,
  type Position,
  worldToLatitude,
  worldToLongitude,
} from '../coordinates'

export type ProjectionMap = {
  project(lngLat: [number, number]): Position
  unproject(point: [number, number]): { lat: number; lng: number }
  getCanvas(): { getBoundingClientRect(): { left: number; top: number } }
}

export function toViewportPosition(
  map: ProjectionMap,
  globalX: number,
  globalY: number,
): Position {
  const point = map.project([
    worldToLongitude(globalX),
    worldToLatitude(globalY),
  ])
  const rect = map.getCanvas().getBoundingClientRect()
  return { x: point.x + rect.left, y: point.y + rect.top }
}

export function fromViewportPosition(map: ProjectionMap, point: Position) {
  const rect = map.getCanvas().getBoundingClientRect()
  const position = map.unproject([point.x - rect.left, point.y - rect.top])
  return {
    globalX: longitudeToWorld(position.lng),
    globalY: latitudeToWorld(position.lat),
  }
}

export type ViewportRect = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Screen-space offset that brings `point` to the middle of `rect`, or
 * `undefined` while it already lies inside the central `share` of both axes
 */
export function panToCentral(
  point: Position,
  rect: ViewportRect,
  share: number,
): Position | undefined {
  const dx = point.x - (rect.left + rect.width / 2)
  const dy = point.y - (rect.top + rect.height / 2)
  if (
    Math.abs(dx) <= (rect.width * share) / 2 &&
    Math.abs(dy) <= (rect.height * share) / 2
  )
    return undefined
  return { x: dx, y: dy }
}

export function pixelCenterToViewport(
  map: ProjectionMap,
  globalX: number,
  globalY: number,
): Position {
  return toViewportPosition(map, globalX + 0.5, globalY + 0.5)
}
