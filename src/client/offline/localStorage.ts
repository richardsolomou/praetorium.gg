import { createStore, get, update } from 'idb-keyval'
import { emptyLocalState, parseLocalState, withCurrentNames, type LocalState } from '../../contracts/localState'
import { requestNativeLocalState, supportsNativeLocalState } from '../nativeBridge'
import type { LocalStateStorage } from './syncEngine'
import { holdingReload } from '../pendingWrites'

export const STORAGE_LIMIT_MESSAGE = 'Saved work exceeds this device’s storage limit.'
export const SAVING_ELSEWHERE_MESSAGE = 'Another window is saving changes. Try again.'

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

// The shell accepts a write only at the revision it was read at, so this screen's writes take turns instead of refusing each other.
const nativeWrites = new Map<string, Promise<unknown>>()
function nativeWrite<T>(owner: string, write: () => Promise<T>): Promise<T> {
  const next = (nativeWrites.get(owner) ?? Promise.resolve()).catch(() => undefined).then(write)
  nativeWrites.set(owner, next)
  return next
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
    const parsed = saved.state ? parseLocalState(withCurrentNames(saved.state)) : null
    if (saved.state && (!parsed || parsed.owner !== owner)) throw new Error('Saved changes belong to another account.')
    epoch = saved.epoch
    const state = parsed ?? { ...emptyLocalState(owner), epoch: saved.epoch }
    verified = { saved, state }
    return state
  }
  return {
    read: async () => verify(await readStoredState(owner, true)),
    change: (change) => holdingReload(write(change)),
  }

  async function write(change: Parameters<LocalStateStorage['change']>[0]): Promise<LocalState> {
    if (supportsNativeLocalState())
      return nativeWrite(owner, async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          // The shell refuses a write made against a stale revision, so only a retry needs the shell's copy.
          const saved = await readStoredState(owner, attempt === 0)
          const current = verify(saved)
          const changed = change(current)
          if (changed === current) return current
          const next = { ...changed, revision: current.revision + 1 }
          if (!parseLocalState(next)) throw new Error(STORAGE_LIMIT_MESSAGE)
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
        throw new Error(SAVING_ELSEWHERE_MESSAGE)
      })
    let result!: StoredState
    let kept: LocalState | undefined
    await update<StoredState>(
      `work:${owner}`,
      (saved) => {
        const previous = saved ?? { epoch: crypto.randomUUID(), state: null }
        const current = verify(previous)
        const changed = change(current)
        if (changed === current) {
          kept = current
          return previous
        }
        const next = { ...changed, revision: current.revision + 1 }
        if (!parseLocalState(next)) throw new Error(STORAGE_LIMIT_MESSAGE)
        result = { epoch: previous.epoch, state: next }
        return result
      },
      store,
    )
    if (kept) return kept
    notify(owner, result)
    return result.state!
  }
}

export async function clearLocalState(owner: string, onlyIfClean = false) {
  if (supportsNativeLocalState())
    return nativeWrite(owner, async () => {
      const saved = await readStoredState(owner)
      if (onlyIfClean && saved.state?.operations.length) return
      const answer = await requestNativeLocalState(owner, { state: null, epoch: saved.epoch, expectedRevision: saved.state?.revision ?? 0 })
      if (!answer.saved) {
        if (onlyIfClean) return
        throw new Error('Another window has saved changes. Try signing out again.')
      }
      notify(owner, answer)
    })
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
