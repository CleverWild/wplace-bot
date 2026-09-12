import { type WPlaceBot } from './bot'
import { pixelSizeForZoom, type Position, WORLD_TILE_SIZE } from './coordinates'
import { fromViewportPosition, toViewportPosition } from './site/projection'

export {
  latitudeToWorld,
  longitudeToWorld,
  pixelSizeForZoom,
  type Position,
  WORLD_PIXEL_SIZE,
  WORLD_TILE_SIZE,
  WORLD_TILES,
  worldToLatitude,
  worldToLongitude,
  zoomForPixelSize,
} from './coordinates'

export class WorldPosition {
  public static fromJSON(
    bot: WPlaceBot,
    data: ReturnType<WorldPosition['toJSON']>,
  ) {
    return new WorldPosition(bot, ...data)
  }

  public static fromScreenPosition(bot: WPlaceBot, position: Position) {
    const { globalX, globalY } = fromViewportPosition(bot.map, position)
    return new WorldPosition(bot, globalX | 0, globalY | 0)
  }

  public globalX = 0

  public globalY = 0

  public get tileX(): number {
    return (this.globalX / WORLD_TILE_SIZE) | 0
  }
  public set tileX(value: number) {
    this.globalX = value * WORLD_TILE_SIZE + this.x
  }

  public get tileY(): number {
    return (this.globalY / WORLD_TILE_SIZE) | 0
  }
  public set tileY(value: number) {
    this.globalY = value * WORLD_TILE_SIZE + this.y
  }

  public get x(): number {
    return this.globalX % WORLD_TILE_SIZE
  }
  public set x(value: number) {
    this.globalX = this.tileX * WORLD_TILE_SIZE + value
  }

  public get y(): number {
    return this.globalY % WORLD_TILE_SIZE
  }
  public set y(value: number) {
    this.globalY = this.tileY * WORLD_TILE_SIZE + value
  }

  /** Screen pixels one map pixel takes right now */
  public get pixelSize() {
    return pixelSizeForZoom(this.bot.map.getZoom())
  }

  public constructor(
    protected bot: WPlaceBot,
    tileorGlobalX: number,
    tileorGlobalY: number,
    x?: number,
    y?: number,
  ) {
    if (x === undefined || y === undefined) {
      this.globalX = tileorGlobalX
      this.globalY = tileorGlobalY
    } else {
      this.globalX = tileorGlobalX * WORLD_TILE_SIZE + x
      this.globalY = tileorGlobalY * WORLD_TILE_SIZE + y
    }
  }

  /** Get screen position */
  public toScreenPosition(): Position {
    return toViewportPosition(this.bot.map, this.globalX, this.globalY)
  }

  /** Scroll screen to this position */
  public moveScreenTo() {
    const { x, y } = this.toScreenPosition()
    this.bot.moveMap({
      x: x - window.innerWidth / 3,
      y: y - window.innerHeight / 3,
    })
  }

  public clone() {
    return new WorldPosition(this.bot, this.tileX, this.tileY, this.x, this.y)
  }

  public toJSON() {
    return [this.globalX, this.globalY] as const
  }
}
