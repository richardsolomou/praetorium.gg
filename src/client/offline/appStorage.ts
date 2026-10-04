import { createStore, get, update } from 'idb-keyval'
import { MAX_APP_SNAPSHOT_BYTES, parseAppSnapshot, type AppSnapshot } from '../../contracts/appSnapshot'
import { requestNativeAppSnapshot, supportsNativeAppSnapshot } from '../nativeBridge'

const store = createStore('praetorium-app', 'state')
export const APP_ACCOUNT_EVENT = 'praetorium-app-account'
let epoch: string | undefined
type SavedState = { epoch: string; snapshot: unknown }

export async function readAppSnapshot(): Promise<AppSnapshot | null> {
  if (supportsNativeAppSnapshot()) return window.PraetoriumAppSnapshot ?? null
  let saved = await get<SavedState>('snapshot', store)
  if (!saved) {
    await update<SavedState>(
      'snapshot',
      (current) => {
        saved = current ?? { epoch: crypto.randomUUID(), snapshot: null }
        return saved
      },
      store,
    )
  }
  epoch = saved!.epoch
  return parseAppSnapshot(saved!.snapshot)
}

export async function writeAppSnapshot(snapshot: AppSnapshot | null, reset = false): Promise<void> {
  if (snapshot && new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_APP_SNAPSHOT_BYTES) return
  if (supportsNativeAppSnapshot()) {
    if (!(await requestNativeAppSnapshot(snapshot))) throw new Error('Application data could not be saved')
    window.PraetoriumAppSnapshot = snapshot ?? undefined
    return
  }
  const expectedEpoch = epoch
  await update<SavedState | undefined>(
    'snapshot',
    (saved) => {
      if (reset) epoch = crypto.randomUUID()
      if (!epoch || (!reset && saved?.epoch !== expectedEpoch)) return saved
      return { epoch, snapshot }
    },
    store,
  )
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
