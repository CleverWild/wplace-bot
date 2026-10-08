import { wait } from '@softsky/utils'

import { loadedChunkUrls } from '../map'

import {
  allowedTemplateColors,
  indexTemplatePixels,
  parseSiteTemplates,
  type SiteTemplate,
  usedPaletteIndices,
} from './template-data'
import {
  discoverTemplateRuntime,
  type NativeTemplateRuntime,
} from './template-runtime'

const TEMPLATES_DB = 'wplace-templates'
const TEMPLATES_STORE = 'images'
const SLICE_MS = 12

/** Opening a database that is not there creates it, which would stop wplace's own upgrade */
function openSiteDatabase() {
  return new Promise<IDBDatabase | undefined>((resolve) => {
    const request = indexedDB.open(TEMPLATES_DB)
    request.onupgradeneeded = () => {
      request.transaction?.abort()
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      resolve(undefined)
    }
  })
}

async function readSourceBlob(id: string) {
  const db = await openSiteDatabase()
  if (!db?.objectStoreNames.contains(TEMPLATES_STORE)) {
    db?.close()
    return
  }
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db
        .transaction(TEMPLATES_STORE, 'readonly')
        .objectStore(TEMPLATES_STORE)
        .get(id)
      request.onsuccess = () => {
        resolve(request.result as Blob | undefined)
      }
      request.onerror = () => {
        reject(
          request.error ?? new Error('Wplace template image is unreadable'),
        )
      }
    })
  } finally {
    db.close()
  }
}

/**
 * Read-only view of wplace's own template manager. Metadata and the change
 * notifications come from its live store; pixels are decoded, scaled and
 * matched to the palette with its own functions on private buffers, so the
 * bot sees exactly what wplace draws without sharing its render queue.
 */
export class SiteTemplates {
  public static async connect() {
    return new SiteTemplates(await discoverTemplateRuntime(loadedChunkUrls()))
  }

  protected constructor(protected readonly runtime: NativeTemplateRuntime) {}

  /** Throws when the list cannot be read, so a failure never looks like an empty list */
  public list(): SiteTemplate[] {
    return parseSiteTemplates(this.runtime.store.templates)
  }

  /** Metadata and image edits both end up here */
  public subscribe(listener: () => void): () => void {
    const unsubscribers = [
      this.runtime.store.subscribeChange(listener),
      this.runtime.subscribeImage(listener),
    ]
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }

  /** Palette indices of the template at its placed size */
  public async pixels(
    template: SiteTemplate,
    unavailableColors: ReadonlySet<number>,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const blob = await readSourceBlob(template.id)
    if (!blob) throw new Error('Wplace template image is missing')
    const source = await this.runtime.decode(blob)
    const { colorMetric, dithering } = template
    let allowed = allowedTemplateColors(template, unavailableColors)
    if (template.colorPaletteMode === 'template') {
      const probe = new ImageData(
        new Uint8ClampedArray(source.data),
        source.width,
        source.height,
      )
      await this.quantize(probe, colorMetric, false, undefined)
      allowed = usedPaletteIndices(probe.data)
    }
    const scaled = await this.runtime.resize(
      source,
      template.width,
      template.height,
      { signal },
    )
    await this.quantize(scaled, colorMetric, dithering, allowed)
    signal?.throwIfAborted()
    return indexTemplatePixels(scaled.data, scaled.width, scaled.height)
  }

  protected async quantize(
    image: ImageData,
    metric: SiteTemplate['colorMetric'],
    dithering: boolean,
    allowed: number[] | undefined,
  ) {
    const rows = this.runtime.quantize(
      image.data,
      image.width,
      image.height,
      metric,
      dithering,
      allowed,
      new Map(),
    )
    let sliceStart = performance.now()
    while (!rows.next().done)
      if (performance.now() - sliceStart >= SLICE_MS) {
        await wait(0)
        sliceStart = performance.now()
      }
  }
}
