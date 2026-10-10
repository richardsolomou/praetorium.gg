import { MAX_LOCAL_STATE_BYTES, parseLocalState, type LocalState } from '../../src/contracts/localState'
import { readSavedState, writeSavedState } from './savedStateStorage'

type StoredState = { epoch: string; state: LocalState | null }
const storageId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const storageName = (owner: string) => `local-work-${Array.from(owner, (character) => character.charCodeAt(0).toString(16)).join('-')}`

export function readLocalState(owner: string): StoredState {
  const saved = readSavedState<StoredState>(storageName(owner), MAX_LOCAL_STATE_BYTES + 1024, (value) => {
    const data = value as StoredState | null
    if (!data || typeof data.epoch !== 'string') return null
    const state = data.state === null ? null : parseLocalState(data.state)
    return data.state === null || state ? { epoch: data.epoch, state } : null
  })
  if (saved) return saved
  const initial = { epoch: storageId(), state: null }
  writeSavedState(storageName(owner), initial, storageId(), MAX_LOCAL_STATE_BYTES + 1024)
  return initial
}

export function storeLocalState(owner: string, state: LocalState | null, epoch: string, expectedRevision: number, id: string) {
  if (state && state.owner !== owner) throw new Error('Saved changes belong to another account.')
  const previous = readLocalState(owner)
  if (previous.epoch !== epoch || (previous.state?.revision ?? 0) !== expectedRevision) return { ...previous, saved: false }
  const next = state ? { epoch, state } : { epoch: storageId(), state: null }
  writeSavedState(storageName(owner), next, id, MAX_LOCAL_STATE_BYTES + 1024, Boolean(state))
  return { ...next, saved: true }
}
