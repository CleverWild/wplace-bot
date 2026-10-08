import { type ColorMetric, COLORS_RGB } from '../colors'
import { latitudeToWorld, longitudeToWorld } from '../coordinates'

export type SiteTemplate = {
  id: string
  name: string
  position: [number, number]
  width: number
  height: number
  visible: boolean
  colorMetric: ColorMetric
  dithering: boolean
  useLegacyColors: boolean
  colorPaletteMode: 'all' | 'free' | 'template' | 'unlocked'
  templateColorIdxs?: number[]
  /** Everything that can change; compared to notice any edit */
  revision: string
  /** Everything the pixels depend on, so a rename never recalculates */
  contentKey: string
}

type Metadata = {
  id?: unknown
  name?: unknown
  serverManaged?: unknown
  hasPlaced?: unknown
  bounds?: { north?: unknown; south?: unknown; east?: unknown; west?: unknown }
  visible?: unknown
  colorMetric?: unknown
  dithering?: unknown
  useLegacyColors?: unknown
  colorPaletteMode?: unknown
  templateColorIdxs?: unknown
  updatedAt?: unknown
}

export function parseSiteTemplates(raw: unknown): SiteTemplate[] {
  if (!Array.isArray(raw)) throw new Error('Wplace template list is unreadable')
  const result: SiteTemplate[] = []
  const ids = new Set<string>()
  for (const value of raw) {
    if (!value || typeof value !== 'object')
      throw new Error('Wplace template metadata is unreadable')
    const item = value as Metadata
    if (item.serverManaged || item.hasPlaced === false) continue
    const { id, name, bounds } = item
    if (
      typeof id !== 'string' ||
      !id ||
      ids.has(id) ||
      typeof name !== 'string' ||
      !bounds ||
      ![bounds.west, bounds.east, bounds.north, bounds.south].every(
        (n) => typeof n === 'number' && Number.isFinite(n),
      )
    )
      throw new Error('Wplace template metadata is unreadable')
    ids.add(id)
    const x1 = Math.round(longitudeToWorld(bounds.west as number))
    const x2 = Math.round(longitudeToWorld(bounds.east as number))
    const y1 = Math.round(latitudeToWorld(bounds.north as number))
    const y2 = Math.round(latitudeToWorld(bounds.south as number))
    const metric = item.colorMetric ?? 'lab'
    const mode = item.colorPaletteMode ?? 'all'
    if (
      !['lab', 'ciede2000', 'compuphase'].includes(metric as string) ||
      !['all', 'free', 'template', 'unlocked'].includes(mode as string)
    )
      throw new Error('Unsupported Wplace template color settings')
    const palette = item.templateColorIdxs
    if (
      palette !== undefined &&
      (!Array.isArray(palette) ||
        palette.some(
          (n: unknown) =>
            typeof n !== 'number' ||
            !Number.isInteger(n) ||
            n < 1 ||
            n >= COLORS_RGB.length,
        ))
    )
      throw new Error('Unsupported Wplace template palette')
    const template: SiteTemplate = {
      id,
      name,
      position: [Math.min(x1, x2), Math.min(y1, y2)],
      width: Math.max(1, Math.abs(x2 - x1)),
      height: Math.max(1, Math.abs(y2 - y1)),
      visible: item.visible !== false,
      colorMetric: metric as ColorMetric,
      dithering: item.dithering === true,
      useLegacyColors: item.useLegacyColors === true,
      colorPaletteMode: mode as SiteTemplate['colorPaletteMode'],
      templateColorIdxs: palette as number[] | undefined,
      revision: '',
      contentKey: '',
    }
    if (
      !Number.isSafeInteger(template.width * template.height) ||
      !template.position.every(Number.isFinite)
    )
      throw new Error('Wplace template bounds are unreadable')
    template.revision = JSON.stringify([template, item.updatedAt ?? null])
    template.contentKey = JSON.stringify([
      template.position,
      template.width,
      template.height,
      template.visible,
      template.colorMetric,
      template.dithering,
      template.colorPaletteMode,
      template.templateColorIdxs ?? null,
      item.updatedAt ?? null,
    ])
    result.push(template)
  }
  return result
}

export function allowedTemplateColors(
  template: SiteTemplate,
  unavailable: ReadonlySet<number>,
) {
  switch (template.colorPaletteMode) {
    case 'free':
      return Array.from({ length: 31 }, (_, i) => i + 1)
    case 'unlocked':
      return Array.from(
        { length: COLORS_RGB.length - 1 },
        (_, i) => i + 1,
      ).filter((i) => !unavailable.has(i))
    case 'template':
    case 'all':
      return undefined
  }
}

const paletteIndices = new Map(COLORS_RGB.map((rgb, index) => [rgb, index]))

export function indexTemplatePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (data.length !== width * height * 4)
    throw new Error('Invalid Wplace pixel dimensions')
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    const offset = i * 4
    if (data[offset + 3]! < 16) continue
    const index = paletteIndices.get(
      (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!,
    )
    if (index === undefined || index === 0)
      throw new Error('Wplace returned an unsupported palette color')
    pixels[i] = index
  }
  return pixels
}

export function usedPaletteIndices(data: Uint8ClampedArray) {
  const used = new Set<number>()
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3]! < 16) continue
    const index = paletteIndices.get(
      (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!,
    )
    if (index) used.add(index)
  }
  return [...used].sort((a, b) => a - b)
}

export type TemplatePlan = {
  /** Images whose template is gone from the site */
  remove: string[]
  /** Templates to build images for: saved ones in their saved order, then new ones */
  create: string[]
}

/** What to do to our images so they match the site's templates */
export function planTemplateSync(
  imageIds: readonly string[],
  savedIds: readonly string[],
  templates: readonly SiteTemplate[],
): TemplatePlan {
  const present = new Set(templates.map((template) => template.id))
  const shown = new Set(imageIds)
  const saved = new Set(savedIds)
  return {
    remove: imageIds.filter((id) => !present.has(id)),
    create: [
      ...savedIds.filter((id) => present.has(id) && !shown.has(id)),
      ...templates
        .map((template) => template.id)
        .filter((id) => !shown.has(id) && !saved.has(id)),
    ],
  }
}
