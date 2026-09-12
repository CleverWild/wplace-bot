import { afterEach, expect, test } from 'bun:test'

import { deleteAllData, idbGet, idbSet } from './store'

const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
let closeDatabase: (() => void) | undefined
afterEach(() => {
  closeDatabase?.()
  if (original) Object.defineProperty(globalThis, 'indexedDB', original)
  else Reflect.deleteProperty(globalThis, 'indexedDB')
})

function installDatabase(abort = false) {
  const records = new Map<string, unknown>()
  const state = { opens: 0, closes: 0 }
  const db = {
    onversionchange: undefined as (() => void) | undefined,
    close: () => {
      state.closes++
    },
    transaction: (store: string) => {
      expect(store).toBe('saves')
      const transaction = {
        error: null,
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        objectStore: (name: string) => {
          expect(name).toBe('saves')
          return {
            put: (value: unknown, key: string) => {
              queueMicrotask(() => {
                if (abort) transaction.onabort?.()
                else {
                  records.set(key, value)
                  transaction.oncomplete?.()
                }
              })
            },
            get: (key: string) => {
              const request = {
                result: records.get(key),
                onsuccess: undefined as (() => void) | undefined,
              }
              queueMicrotask(() => request.onsuccess?.())
              return request
            },
          }
        },
      }
      return transaction
    },
  }
  closeDatabase = () => db.onversionchange?.()
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open: (name: string, version: number) => {
        expect(name).toBe('wbot')
        expect(version).toBe(1)
        state.opens++
        const request = {
          result: db,
          onsuccess: undefined as (() => void) | undefined,
        }
        queueMicrotask(() => request.onsuccess?.())
        return request
      },
      deleteDatabase: (name: string) => {
        expect(name).toBe('wbot')
        const request = { onsuccess: undefined as (() => void) | undefined }
        queueMicrotask(() => {
          records.clear()
          request.onsuccess?.()
        })
        return request
      },
    },
  })
  return state
}

test('opens storage lazily and reuses its connection for a write and read', async () => {
  const state = installDatabase()
  expect(state.opens).toBe(0)
  await idbSet('wbot', { version: 8 })
  const saved = await idbGet<{ version: number }>('wbot')
  expect(saved).toEqual({ version: 8 })
  expect(state.opens).toBe(1)
})

test('rejects an aborted transaction instead of leaving the save pending', async () => {
  installDatabase(true)
  const [result] = await Promise.allSettled([idbSet('wbot', { version: 8 })])
  expect(result.status).toBe('rejected')
}, 500)

test('closes its own connection before deleting and reopens for subsequent reads', async () => {
  const state = installDatabase()
  await idbSet('wbot', 1)
  await deleteAllData()
  expect(state.closes).toBe(1)
  const saved = await idbGet<number>('wbot')
  expect(saved).toBeUndefined()
  expect(state.opens).toBe(2)
})
