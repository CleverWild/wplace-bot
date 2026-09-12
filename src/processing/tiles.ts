import { WORLD_TILE_SIZE } from '../coordinates'

export const packTile = (tileX: number, tileY: number) => (tileX << 11) | tileY
export const toTile = (n: number) => (n / WORLD_TILE_SIZE) | 0
export const toTilePosition = (n: number) => n % WORLD_TILE_SIZE
