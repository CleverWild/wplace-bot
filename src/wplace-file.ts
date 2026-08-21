import { type BotImage } from './image'
import {
  latitudeToWorld,
  longitudeToWorld,
  worldToLatitude,
  worldToLongitude,
} from './world-position'

/**
 * wplace.live's own template format, as exported by its template manager.
 * This is their public contract (`schemaVersion`), so keep it isolated here
 * instead of leaking their field names into our save format.
 */
export type WplaceFile = {
  id: string
  schemaVersion: string
  name: string
  opacity: number
  image: {
    dataUrl: string
    width: number
    height: number
  }
  bounds: {
    north: number
    south: number
    west: number
    east: number
  }
  colorMetric: string
  dithering: boolean
  useLegacyColors: boolean
  colorPaletteMode: string
  order: number
  locked: boolean
  hasPlaced: boolean
  visible: boolean
}

/** The parts of a template the site owns, in our units */
export type SiteTemplateData = {
  position: [number, number]
  width: number
  opacity?: number
  lock?: boolean
  disabled: boolean
  name?: string
}

/** Everything a template says about itself except the image */
function placement(template: Partial<WplaceFile>): SiteTemplateData {
  const bounds = template.bounds
  if (
    !bounds ||
    [bounds.north, bounds.south, bounds.west, bounds.east].some(
      (x) => typeof x !== 'number' || !Number.isFinite(x),
    )
  )
    throw new Error('Template has no usable bounds')
  const globalX = Math.round(longitudeToWorld(bounds.west))
  const globalY = Math.round(latitudeToWorld(bounds.north))
  return {
    position: [globalX, globalY] as [number, number],
    width: Math.max(1, Math.round(longitudeToWorld(bounds.east)) - globalX),
    opacity:
      typeof template.opacity === 'number'
        ? Math.round(template.opacity * 100)
        : undefined,
    lock: template.locked,
    disabled: template.visible === false,
    name: template.name,
  }
}

/**
 * Convert a parsed `.wplace` file into arguments for `BotImage.fromJSON`.
 * The bounds carry the on-map size, so the template keeps its scale.
 */
export function fromWplaceFile(raw: unknown) {
  const file = raw as Partial<WplaceFile>
  if (typeof file.image?.dataUrl !== 'string')
    throw new Error('Not a valid .wplace template')
  return { ...placement(file), url: file.image.dataUrl }
}

// === wplace's own template manager ===
// Metadata lives in localStorage, images live in an IndexedDB blob store keyed
// by the same id. Read-only: their Google Drive backup tracks content
// signatures, so writing into it behind their back risks their data.

export const OVERLAYS_KEY = 'template-overlays'
const TEMPLATES_DB = 'wplace-templates'
const TEMPLATES_STORE = 'images'

/** Templates currently placed in wplace's own template manager */
export function readSiteTemplates() {
  let overlays: Partial<WplaceFile>[]
  try {
    overlays = JSON.parse(
      localStorage.getItem(OVERLAYS_KEY) ?? '[]',
    ) as Partial<WplaceFile>[]
  } catch {
    return []
  }
  if (!Array.isArray(overlays)) return []
  const templates: { id: string; data: SiteTemplateData }[] = []
  for (let index = 0; index < overlays.length; index++) {
    const overlay = overlays[index]
    if (typeof overlay?.id !== 'string') continue
    try {
      templates.push({ id: overlay.id, data: placement(overlay) })
    } catch {
      // A template we can't place is one we can't import
    }
  }
  return templates
}

/** Read one template image out of wplace's store as a data URL */
export async function readSiteTemplateImage(id: string) {
  const db = await new Promise<IDBDatabase | undefined>((resolve) => {
    const request = indexedDB.open(TEMPLATES_DB)
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      resolve(undefined)
    }
  })
  if (!db?.objectStoreNames.contains(TEMPLATES_STORE)) {
    db?.close()
    return
  }
  const blob = await new Promise<Blob | undefined>((resolve) => {
    const request = db
      .transaction(TEMPLATES_STORE, 'readonly')
      .objectStore(TEMPLATES_STORE)
      .get(id)
    request.onsuccess = () => {
      resolve(request.result as Blob | undefined)
    }
    request.onerror = () => {
      resolve(undefined)
    }
  })
  db.close()
  if (!blob) return
  return new Promise<string | undefined>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(reader.result as string)
    }
    reader.onerror = () => {
      resolve(undefined)
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Serialize an image into a `.wplace` template.
 * Exports the quantized canvas, so it is already at map scale and needs no
 * resampling on their side.
 */
export function toWplaceFile(image: BotImage, order = 0): WplaceFile {
  const { globalX, globalY } = image.position
  return {
    id: crypto.randomUUID(),
    schemaVersion: '1',
    name: image.name,
    opacity: image.opacity / 100,
    image: {
      dataUrl: image.$canvas.toDataURL('image/png'),
      width: image.width,
      height: image.height,
    },
    bounds: {
      north: worldToLatitude(globalY),
      south: worldToLatitude(globalY + image.height),
      west: worldToLongitude(globalX),
      east: worldToLongitude(globalX + image.width),
    },
    // We export an already quantized canvas, so these all mean "leave the
    // pixels alone": dithering would smear finished pixels, legacy colors or a
    // restricted palette would remap them, and ciede2000 (our deltaE2000) maps
    // every palette color onto itself.
    colorMetric: 'ciede2000',
    dithering: false,
    useLegacyColors: false,
    colorPaletteMode: 'all',
    order,
    locked: image.lock,
    hasPlaced: false,
    visible: !image.disabled,
  }
}
