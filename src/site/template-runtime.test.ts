/* eslint-disable @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method */
import { expect, test } from 'bun:test'

import {
  matchingExport,
  referencedChunks,
  resolveTemplateRuntime,
} from './template-runtime'

// Source text is what the matchers read, so the stubs are built from strings
// shaped like the minified functions they stand in for
const build = (source: string) =>
  new Function(`return (${source})`)() as () => unknown

const quantize = build('function*(e){new Float32Array(4);yield e*7/16}')
const decode = build(
  'async function(e){let t=await e.arrayBuffer();try{return t.getImageData}finally{}}',
)
const subscribeImage = build('function(e){return Y.add(e),()=>Y.delete(e)}')
const resize = build(
  'function(e,t,n,r){return e.copyWithin(0,1),r.timeSliceMs+r.signal}',
)

const store = { templates: [], subscribeChange: () => () => undefined }
const imageModule = { decode, quantize, subscribeImage, noise: () => 1 }
const resizeModule = { resize, noise: () => 1 }

test('a function is found by what it does, not by its name', () => {
  const found = matchingExport({ x: () => 1, y: quantize }, (source) =>
    source.includes('Float32Array'),
  )
  expect(found).toBe(quantize)
})

test('no match and several matches are both incompatibility errors', () => {
  expect(() => matchingExport({ x: () => 1 }, () => false)).toThrow(
    'incompatible',
  )
  expect(() => matchingExport({ x: () => 1, y: () => 2 }, () => true)).toThrow(
    'incompatible',
  )
})

test('every native function is resolved from the modules', () => {
  const runtime = resolveTemplateRuntime(
    { other: {}, templateStore: store },
    imageModule,
    resizeModule,
  )
  expect(runtime.store).toBe(store)
  expect(runtime.decode).toBe(decode as never)
  expect(runtime.subscribeImage).toBe(subscribeImage as never)
  expect(runtime.resize).toBe(resize as never)
})

test('a missing store or a changed function refuses to run', () => {
  expect(() =>
    resolveTemplateRuntime({ other: {} }, imageModule, resizeModule),
  ).toThrow('store')
  expect(() =>
    resolveTemplateRuntime(
      { store },
      { ...imageModule, quantize: () => 1 },
      resizeModule,
    ),
  ).toThrow('incompatible')
})

test('chunk references stay on the site and under the app directory', () => {
  const base = 'https://wplace.live/_app/immutable/chunks/a.js'
  const source =
    'import"./b.js";import"../nodes/c.js";import"https://evil.example/_app/immutable/chunks/d.js";import"/other/e.js"'
  expect(referencedChunks(source, base)).toEqual([
    'https://wplace.live/_app/immutable/chunks/b.js',
    'https://wplace.live/_app/immutable/nodes/c.js',
  ])
})
