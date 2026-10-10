import { createStore, get, update } from 'idb-keyval'
import { emptyLocalState, parseLocalState, type LocalState } from '../../contracts/localState'
import { requestNativeLocalState, supportsNativeLocalState } from '../nativeBridge'
import type { LocalStateStorage } from './syncEngine'

declare global {
  interface Window {
    PraetoriumLocalState?: { epoch: string; state: LocalState | null }
  }
}
type StoredState = { epoch: string; state: LocalState | null }
let cachedStored: { owner: string; value: StoredState } | undefined
let watching = false
function watchStorage() {
  if (watching) return
  watching = true
  window.addEventListener('storage', (event) => {
    if (event.key === LOCAL_STATE_EVENT) cachedStored = undefined
  })
  window.addEventListener(LOCAL_STATE_EVENT, () => {
    cachedStored = undefined
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') cachedStored = undefined
  })
}
const store = createStore('praetorium-work', 'state')
export const LOCAL_STATE_EVENT = 'praetorium-local-work'

async function readStoredState(owner: string, allowCached = false): Promise<StoredState> {
  watchStorage()
  if (allowCached && cachedStored?.owner === owner) return cachedStored.value
  if (supportsNativeLocalState()) {
    const value = await requestNativeLocalState(owner)
    window.PraetoriumLocalState = value
    cachedStored = { owner, value }
    return value
  }
  let value = await get<StoredState>(`work:${owner}`, store)
  if (!value)
    await update<StoredState>(
      `work:${owner}`,
      (current) => {
        value = current ?? { epoch: crypto.randomUUID(), state: null }
        return value
      },
      store,
    )
  cachedStored = { owner, value: value! }
  return value!
}

function notify(owner: string, state: StoredState) {
  window.PraetoriumLocalState = state
  window.dispatchEvent(new Event(LOCAL_STATE_EVENT))
  cachedStored = { owner, value: state }
  try {
    localStorage.setItem(LOCAL_STATE_EVENT, `${state.epoch}:${state.state?.revision ?? 0}`)
  } catch {
    /* IndexedDB remains the storage authority. */
  }
}

export function localStateStorage(owner: string): LocalStateStorage {
  let epoch: string | undefined
  let verified: { saved: StoredState; state: LocalState } | undefined
  const verify = (saved: StoredState) => {
    if (verified?.saved === saved) return verified.state
    if (epoch && epoch !== saved.epoch) throw new Error('The account on this device changed.')
    if (saved.state && (!parseLocalState(saved.state) || saved.state.owner !== owner))
      throw new Error('Saved changes belong to another account.')
    epoch = saved.epoch
    const state = saved.state ?? { ...emptyLocalState(owner), epoch: saved.epoch }
    verified = { saved, state }
    return state
  }
  return {
    read: async () => verify(await readStoredState(owner, true)),
    change: async (change) => {
      if (supportsNativeLocalState()) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const saved = await readStoredState(owner)
          const current = verify(saved)
          const next = { ...change(current), revision: current.revision + 1 }
          if (!parseLocalState(next)) throw new Error('Saved work exceeds this device’s storage limit.')
          const answer = await requestNativeLocalState(owner, {
            state: next,
            epoch: saved.epoch,
            expectedRevision: saved.state?.revision ?? 0,
          })
          if (answer.saved) {
            notify(owner, answer)
            return next
          }
          verify(answer)
        }
        throw new Error('Another window is saving changes. Try again.')
      }
      let result!: StoredState
      await update<StoredState>(
        `work:${owner}`,
        (saved) => {
          const previous = saved ?? { epoch: crypto.randomUUID(), state: null }
          const current = verify(previous)
          const next = { ...change(current), revision: current.revision + 1 }
          if (!parseLocalState(next)) throw new Error('Saved work exceeds this device’s storage limit.')
          result = { epoch: previous.epoch, state: next }
          return result
        },
        store,
      )
      notify(owner, result)
      return result.state!
    },
  }
}

export async function clearLocalState(owner: string, onlyIfClean = false) {
  if (supportsNativeLocalState()) {
    const saved = await readStoredState(owner)
    if (onlyIfClean && saved.state?.operations.length) return
    const answer = await requestNativeLocalState(owner, { state: null, epoch: saved.epoch, expectedRevision: saved.state?.revision ?? 0 })
    if (!answer.saved) {
      if (onlyIfClean) return
      throw new Error('Another window has saved changes. Try signing out again.')
    }
    notify(owner, answer)
    return
  }
  const value = { epoch: crypto.randomUUID(), state: null }
  let cleared = false
  await update<StoredState>(
    `work:${owner}`,
    (current) => {
      if (onlyIfClean && current?.state?.operations.length) return current
      cleared = true
      return value
    },
    store,
  )
  if (cleared) notify(owner, value)
}
