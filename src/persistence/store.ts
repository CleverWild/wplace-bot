const DB_NAME = 'wbot'
const STORE_NAME = 'saves'
const DB_VERSION = 1
export const SAVE_KEY = 'wbot'

let database: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        database = undefined
      }
      resolve(db)
    }
    request.onerror = () => {
      database = undefined
      reject(request.error ?? new Error('IndexedDB request failed'))
    }
  })
  return database
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => {
      resolve(request.result as T | undefined)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'))
    }
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(value, key)
    transaction.oncomplete = () => {
      resolve()
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Save transaction failed'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Save transaction aborted'))
    }
  })
}

export async function deleteAllData(): Promise<void> {
  const db = await database?.catch(() => undefined)
  db?.close()
  database = undefined
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => {
      resolve()
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'))
    }
    request.onblocked = () => {
      reject(new Error('Close other wplace tabs before clearing saved data'))
    }
  })
}
