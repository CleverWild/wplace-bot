import { type ColorMetric } from '../colors'

export type TemplateChange = { id?: string; kind?: string }
export type TemplateStore = {
  templates: unknown[]
  subscribeChange(listener: (change: TemplateChange) => void): () => void
}
export type NativeTemplateRuntime = {
  store: TemplateStore
  decode(blob: Blob): Promise<ImageData>
  resize(
    source: ImageData,
    width: number,
    height: number,
    options?: { signal?: AbortSignal },
  ): Promise<ImageData>
  quantize(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    metric: ColorMetric,
    dithering: boolean,
    allowed: number[] | undefined,
    cache: Map<number, number>,
  ): Generator
  subscribeImage(listener: (change: TemplateChange) => void): () => void
}

export function matchingExport(
  module: Record<string, unknown>,
  test: (source: string) => boolean,
): unknown {
  const matches = Object.values(module).filter(
    (value) =>
      typeof value === 'function' &&
      test(Function.prototype.toString.call(value)),
  )
  if (matches.length !== 1)
    throw new Error(
      'Wplace template functions are incompatible; reload after updating the bot',
    )
  return matches[0]
}

export function resolveTemplateRuntime(
  storeModule: Record<string, unknown>,
  imageModule: Record<string, unknown>,
  resizeModule: Record<string, unknown>,
): NativeTemplateRuntime {
  const stores = Object.values(storeModule).filter((value) => {
    if (!value || typeof value !== 'object') return false
    const store = value as Partial<TemplateStore>
    return (
      Array.isArray(store.templates) &&
      typeof store.subscribeChange === 'function'
    )
  })
  if (stores.length !== 1)
    throw new Error('Wplace template store is unavailable')
  return {
    store: stores[0] as TemplateStore,
    decode: matchingExport(
      imageModule,
      (s) =>
        s.includes('getImageData') &&
        s.includes('.arrayBuffer(') &&
        s.includes('finally'),
    ) as NativeTemplateRuntime['decode'],
    quantize: matchingExport(
      imageModule,
      (s) =>
        /^function\s*\*/.test(s) &&
        s.includes('Float32Array') &&
        s.includes('7/16'),
    ) as NativeTemplateRuntime['quantize'],
    subscribeImage: matchingExport(
      imageModule,
      (s) =>
        s.length < 250 &&
        s.includes('.add(') &&
        s.includes('.delete(') &&
        !s.includes('try'),
    ) as NativeTemplateRuntime['subscribeImage'],
    resize: matchingExport(
      resizeModule,
      (s) =>
        s.includes('copyWithin') &&
        s.includes('timeSliceMs') &&
        s.includes('.signal'),
    ) as NativeTemplateRuntime['resize'],
  }
}

export function referencedChunks(source: string, base: string): string[] {
  const result = new Set<string>()
  for (const match of source.matchAll(
    /["'`]((?:\.\.\/|\.\/)?(?:chunks\/|nodes\/)?[\w.-]+\.js)["'`]/g,
  )) {
    const url = new URL(match[1]!, base)
    if (
      url.origin === new URL(base).origin &&
      url.pathname.startsWith('/_app/immutable/')
    )
      result.add(url.href)
  }
  return [...result]
}

export async function discoverTemplateRuntime(
  initialUrls: string[],
): Promise<NativeTemplateRuntime> {
  const pending = [...new Set(initialUrls)]
  const seen = new Set(pending)
  let storeUrl: string | undefined
  let imageUrl: string | undefined
  let resizeUrl: string | undefined
  for (let offset = 0; offset < pending.length && offset < 600; offset += 8) {
    await Promise.all(
      pending.slice(offset, offset + 8).map(async (url) => {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10000),
          })
          if (!response.ok) return
          const source = await response.text()
          if (
            source.includes('template-overlays') &&
            source.includes('subscribeChange')
          )
            storeUrl = url
          if (
            source.includes('wplace-templates') &&
            source.includes('Template blob change listener failed.')
          )
            imageUrl = url
          if (
            source.includes('Image resize aborted.') &&
            source.includes('timeSliceMs')
          )
            resizeUrl = url
          for (const dependency of referencedChunks(source, url))
            if (!seen.has(dependency)) {
              seen.add(dependency)
              pending.push(dependency)
            }
        } catch {
          /* A removed chunk must not hide other loaded modules. */
        }
      }),
    )
    if (storeUrl && imageUrl && resizeUrl) {
      const [storeModule, imageModule, resizeModule] = (await Promise.all([
        import(storeUrl),
        import(imageUrl),
        import(resizeUrl),
      ])) as Record<string, unknown>[]
      return resolveTemplateRuntime(storeModule!, imageModule!, resizeModule!)
    }
  }
  throw new Error(
    'Wplace template integration is unavailable; reload after updating the bot',
  )
}
