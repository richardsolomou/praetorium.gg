import { type CatalogueChangeSet, type ChangeSource, catalogueChanges, isEmptyChangeSet } from '../core/catalogueChanges'
import { installedSnapshot } from './catalogueSnapshot'

/** What each loaded value was read from, when the snapshot on disk held still for the whole read. */
const loadedFrom = new WeakMap<object, string>()

/**
 * Runs a load against the installed snapshot and remembers which snapshot that was.
 *
 * A swap replaces the directory underneath a running instance, so a read that straddled
 * one is left unlabelled rather than attributed to either side. `alongside` names a value
 * this one was built from, which must have been read from the same snapshot.
 */
export function loadSnapshot<T extends object | null>(directory: string, load: () => T, alongside?: () => object | null): T {
  const before = installedSnapshot(directory)?.id
  const value = load()
  const after = installedSnapshot(directory)?.id
  if (value && before && before === after && (!alongside || snapshotOf(alongside()) === before)) loadedFrom.set(value, before)
  return value
}

export const snapshotOf = (value: object | null | undefined) => (value ? (loadedFrom.get(value) ?? null) : null)

type Recorder = (input: { fromSnapshot: string; toSnapshot: string; changes: CatalogueChangeSet }) => Promise<unknown>

/**
 * Records what a swap changed, from the reference data held before it and after it.
 *
 * Nothing is recorded without both sides: a first install has nothing to compare, and a
 * load that failed or could not be attributed to one snapshot would describe a change
 * nobody made. An update that changed nothing a player pays for records nothing either.
 */
export async function recordSwap(outgoing: ChangeSource | null, incoming: ChangeSource | null, record: Recorder) {
  const fromSnapshot = snapshotOf(outgoing)
  const toSnapshot = snapshotOf(incoming)
  if (!outgoing || !incoming || !fromSnapshot || !toSnapshot || fromSnapshot === toSnapshot) return null
  const changes = catalogueChanges(outgoing, incoming)
  if (isEmptyChangeSet(changes)) return null
  await record({ fromSnapshot, toSnapshot, changes })
  return changes
}
