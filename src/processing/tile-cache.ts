import { COLORS_RGB_MAP } from '../colors'

import { packTile, toTile } from './tiles'

/** Palette indices of one 1000x1000 tile, 0 where nothing is painted */
export type TileLoader = (tileX: number, tileY: number) => Promise<Uint8Array>

export async function fetchTile(
  tileX: number,
  tileY: number,
): Promise<Uint8Array> {
  const response = await fetch(
    `https://backend.wplace.live/files/s0/tiles/${tileX}/${tileY}.png`,
  )
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
    const pixels = new Uint8Array(bitmap.height * bitmap.width)
    for (let i = 0, pi = 0; i < data.length; i += 4, pi++) {
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const a = data[i + 3]!
      const key = (r << 16) | (g << 8) | b
      pixels[pi] = a < 100 ? 0 : (COLORS_RGB_MAP.get(key) ?? 0)
    }
    return pixels
  } finally {
    bitmap.close()
  }
}

/** Tiles are kept until `clear()`: the map only changes when we paint it */
export class TileCache {
  private readonly tiles = new Map<number, Uint8Array>()

  public constructor(private readonly loadTile: TileLoader = fetchTile) {}

  /**
   * Loads every tile under the area, end edges inclusive. Progress covers the
   * first 10% of a calculation.
   */
  public async load(
    globalX: number,
    globalY: number,
    width: number,
    height: number,
    progress?: (p: number) => void,
  ): Promise<ReadonlyMap<number, Uint8Array>> {
    const missing: [number, number][] = []
    const tileXEnd = toTile(globalX + width)
    const tileYStart = toTile(globalY)
    const tileYEnd = toTile(globalY + height)
    for (let tileX = toTile(globalX); tileX <= tileXEnd; tileX++)
      for (let tileY = tileYStart; tileY <= tileYEnd; tileY++)
        if (!this.tiles.has(packTile(tileX, tileY)))
          missing.push([tileX, tileY])

    let done = 0
    await Promise.all(
      missing.map(async ([tileX, tileY]) => {
        this.tiles.set(
          packTile(tileX, tileY),
          await this.loadTile(tileX, tileY),
        )
        done++
        progress?.((done / missing.length) * 0.1)
      }),
    )
    return this.tiles
  }

  public clear() {
    this.tiles.clear()
  }
}
