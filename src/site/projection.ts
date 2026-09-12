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

export function pixelCenterToViewport(
  map: ProjectionMap,
  globalX: number,
  globalY: number,
): Position {
  return toViewportPosition(map, globalX + 0.5, globalY + 0.5)
}
