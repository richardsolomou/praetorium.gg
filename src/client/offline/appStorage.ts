import { MAX_APP_SNAPSHOT_BYTES, parseAppSnapshot, type AppSnapshot } from '../../contracts/appSnapshot'
import { requestNativeAppSnapshot, supportsNativeAppSnapshot } from '../nativeBridge'

const DATABASE = 'praetorium-app'
export const APP_ACCOUNT_EVENT = 'praetorium-app-account'
let database: Promise<IDBDatabase> | undefined
let epoch: string | undefined

function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    database = undefined
    throw error
  })
  return database
}

export async function readAppSnapshot(): Promise<AppSnapshot | null> {
  if (supportsNativeAppSnapshot()) return window.PraetoriumAppSnapshot ?? null
  const db = await open()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite')
    const store = transaction.objectStore('state')
    const request = store.get('snapshot')
    let snapshot: AppSnapshot | null = null
    request.onsuccess = () => {
      const saved = request.result as { epoch: string; snapshot: unknown } | undefined
      epoch = saved?.epoch ?? crypto.randomUUID()
      if (!saved) store.put({ epoch, snapshot: null }, 'snapshot')
      snapshot = parseAppSnapshot(saved?.snapshot)
    }
    transaction.oncomplete = () => resolve(snapshot)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function writeAppSnapshot(snapshot: AppSnapshot | null, reset = false): Promise<void> {
  if (snapshot && new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_APP_SNAPSHOT_BYTES) return
  if (supportsNativeAppSnapshot()) {
    if (!(await requestNativeAppSnapshot(snapshot))) throw new Error('Application data could not be saved')
    window.PraetoriumAppSnapshot = snapshot ?? undefined
    return
  }
  const db = await open()
  const expectedEpoch = epoch
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite')
    const store = transaction.objectStore('state')
    const request = store.get('snapshot')
    request.onsuccess = () => {
      const saved = request.result as { epoch: string } | undefined
      if (reset) epoch = crypto.randomUUID()
      if (!epoch || (!reset && saved?.epoch !== expectedEpoch)) return
      store.put({ epoch, snapshot }, 'snapshot')
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  if (reset) {
    try {
      localStorage.setItem(APP_ACCOUNT_EVENT, epoch!)
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }
}

export async function clearSavedApp() {
  window.PraetoriumAppSnapshot = undefined
  await writeAppSnapshot(null, true)
}
