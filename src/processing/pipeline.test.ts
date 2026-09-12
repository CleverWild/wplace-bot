import { expect, test } from 'bun:test'

import fixtures from './fixtures/pipeline.json'
import { calculatePixels } from './pipeline'
import { type WorkerPixelsRequest } from './protocol'
import { packTile, toTile, toTilePosition } from './tiles'

/** Captured from the worker before extraction, see fixtures/pipeline.json */
for (const fixture of fixtures) {
  test('preserves original worker results: ' + fixture.name, () => {
    const maps = new Map<number, Uint8Array>()
    for (const tileX of [0, 1])
      for (const tileY of [0, 1])
        maps.set(packTile(tileX, tileY), new Uint8Array(1000 * 1000))
    for (const pixel of fixture.mapPixels) {
      const [gx, gy, color] = pixel as [number, number, number]
      maps.get(packTile(toTile(gx), toTile(gy)))![
        toTilePosition(gy) * 1000 + toTilePosition(gx)
      ] = color
    }
    const request = {
      ...fixture.input,
      data: new Uint8ClampedArray(fixture.input.data),
      unavailableColors: new Set(fixture.input.unavailableColors),
      disabledColors: new Set(fixture.input.disabledColors),
    } as WorkerPixelsRequest
    const result = calculatePixels(request, maps)
    expect(Array.from(result.pixels)).toEqual(fixture.expected.pixels)
    expect(Array.from(result.taskPositions)).toEqual(
      fixture.expected.taskPositions,
    )
    const colorStat: unknown[] = Array.from(result.colorStat)
    expect(colorStat).toEqual(fixture.expected.colorStat)
  })
}
