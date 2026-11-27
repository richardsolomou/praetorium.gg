import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import rawPin from '../shared/savedPicks.pin.json' with { type: 'json' }
import type { Roster } from '../core/battle'
import { catalogueEditionId } from '../core/catalogueEdition'
import { currentRosterIds, fieldedRosterIds } from '../core/retiredCatalogueIds'
import type { RosterPick } from '../core/roster'
import {
  type SavedPickTranslations,
  savedPickTranslations,
  savedPicksKey,
  savedPicksPinSchema,
  translatesSavedAt,
  withVsLoadout,
  withVsPicks,
} from '../core/savedPicks'
import { canonicalJson } from '../core/text'
import { readCatalogueComposition } from './catalogueComposition'
import { rosterFromRow } from './rosterPersistence'
import { catalogueDirectory } from './catalogueIndex'
import { privateR2Client, r2Objects } from './r2Client'

/**
 * The pinned translations: their SHA-256 names their object in the players' private bucket, which previews and CI hold
 * no key to, and the bytes it must hold.
 */
export const savedPicksPin = savedPicksPinSchema.parse(rawPin)

/** The pinned translations' bytes, verified against the pin: from this server's copy, else the bucket, then kept. */
export async function savedPicksBytes(dataDirectory = process.env.DATA_DIR ?? '/data'): Promise<Uint8Array> {
  const file = path.join(path.resolve(dataDirectory), 'saved-picks', `${savedPicksPin.sha256}.json`)
  const verified = (bytes: Uint8Array) => hash('sha256', bytes) === savedPicksPin.sha256
  if (fs.existsSync(file)) {
    const bytes = fs.readFileSync(file)
    if (verified(bytes)) return bytes
    fs.rmSync(file)
  }
  const store = privateR2Client()
  if (!store) throw new Error('saved-pick translations are unavailable without the private bucket')
  const bytes = await r2Objects(store).get(savedPicksKey(savedPicksPin.sha256))
  if (!bytes) throw new Error('saved-pick translations are missing from the private bucket')
  if (!verified(bytes)) throw new Error('saved-pick translations do not match their pin')
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, bytes, { mode: 0o600 })
  return bytes
}

let loading: Promise<unknown> | undefined
let loaded: SavedPickTranslations | undefined
let retryAt = 0

/**
 * The frozen translations once loaded, else none while they load: a pick then reads as its catalogue choices, as one
 * saved before VS Data did, so nothing waits on the bucket. The first call starts the load; a failed one retries a
 * minute later.
 */
export function savedPicks(): SavedPickTranslations | undefined {
  if (!loaded && !loading && Date.now() >= retryAt)
    loading = savedPicksBytes()
      .then((bytes) => (loaded = savedPickTranslations(JSON.parse(new TextDecoder().decode(bytes)))))
      .catch((error: unknown) => {
        console.error('saved-pick translations failed to load', error)
        retryAt = Date.now() + 60_000
      })
      .finally(() => (loading = undefined))
  return loaded
}

/** The translations a record saved (or last changed) at `savedAt` may take: none for one saved after the copy they read. */
const savedPicksFor = (savedAt: number) => (translatesSavedAt(savedPicksPin.copiedAt, savedAt) ? savedPicks() : undefined)

const baseRulesVersions = new Map<string, string | undefined>()
/** The rules version a list's picks are keyed in, as the translator read it: its own, else the snapshot's base one. */
function rulesVersionOf(catalogueId: string) {
  const own = catalogueEditionId(catalogueId)
  if (own) return own
  const directory = catalogueDirectory()
  if (!baseRulesVersions.has(directory))
    baseRulesVersions.set(directory, readCatalogueComposition(directory)?.editions.find((entry) => entry.base)?.edition.id)
  return baseRulesVersions.get(directory)
}

/** `picks` with, as `translatedVs`, the `vs` each of `translated` was given where the pick holds none of its own. */
const withTranslationsFrom = <T extends RosterPick>(picks: readonly T[], translated: readonly RosterPick[]) =>
  picks.map((pick, at) => {
    const vs = translated[at]?.vs
    return pick.vs || !vs ? pick : { ...pick, translatedVs: vs }
  })

/*
 * The served readers below attach a frozen translation, as a pick's `translatedVs`, which no save keeps, only inside a
 * read the caller is already allowed, to the record it returns, and only where that record was last saved before the
 * copy the translations read: a record saved later never takes one, so saving a guessed pick can't reveal whether some
 * list held it. Battle reads never call them.
 */

/** A saved roster, as `rosterFromRow` reads it, with its picks' frozen translations. */
export function servedRoster<T extends Parameters<typeof withVsPicks>[0] & { updatedAt: number }>(roster: T): T {
  const translations = savedPicksFor(roster.updatedAt)
  const rulesVersion = translations && rulesVersionOf(roster.catalogueId)
  if (!translations || !rulesVersion) return roster
  const translated = withVsPicks(roster, rulesVersion, translations)
  return translated === roster ? roster : { ...roster, picks: withTranslationsFrom(roster.picks, translated.picks) }
}

/**
 * A stored roster's picks, as stored and with the translations its owner is served kept as their own `vs`, for a write
 * that would move its version past the copy they read; null when it is served none.
 */
export function storedWithTranslations(row: Parameters<typeof rosterFromRow>[0]) {
  const roster = rosterFromRow(row)
  const served = servedRoster(roster)
  if (served === roster) return null
  const stored = JSON.parse(row.picks) as RosterPick[]
  const kept = stored.map((pick, at) => {
    const vs = served.picks[at]?.translatedVs
    return vs && !pick.vs ? { ...pick, vs } : pick
  })
  return { stored, kept }
}

/** A save's picks, each one it leaves as stored taking the translation kept beside it. */
export const withKeptTranslations = <T extends RosterPick>(picks: readonly T[], held: ReturnType<typeof storedWithTranslations>) =>
  held ? picks.map((pick, at) => (canonicalJson(pick) === canonicalJson(held.stored[at]) ? (held.kept[at] as T) : pick)) : [...picks]

/** A saved unit loadout, as stored, with its units' frozen models and wargear, read as one saved when it was created. */
export function servedLoadout<T extends { catalogueId: string; pick: RosterPick; joined?: readonly RosterPick[]; createdAt: number }>(
  loadout: T,
): T {
  const translations = savedPicksFor(loadout.createdAt)
  if (!translations) return loadout
  const stored = [loadout.pick, ...(loadout.joined ?? [])]
  const read = currentRosterIds({ catalogueId: loadout.catalogueId, detachmentIds: [], picks: stored, updatedAt: loadout.createdAt })
  const rulesVersion = rulesVersionOf(read.catalogueId)
  if (!rulesVersion) return loadout
  const [pick, ...joined] = read.picks
  const kept = withVsLoadout({ catalogueId: read.catalogueId, pick: pick!, joined }, rulesVersion, translations)
  const [own, ...rest] = withTranslationsFrom(stored, [kept.pick, ...(kept.joined ?? [])])
  return { ...loadout, pick: own!, ...(loadout.joined ? { joined: rest } : {}) }
}

/**
 * A sealed list, as its entry stores it, with its picks' frozen translations, read as fielded when it was submitted. An
 * entry with no submission time has no time it last changed, so it takes none.
 */
export function servedSealedRoster(roster: Roster, submittedAt: number | null): Roster {
  const built = roster.built
  const translations = built?.picks && submittedAt !== null && savedPicksFor(submittedAt)
  if (!built?.picks || !translations) return roster
  const read = fieldedRosterIds(
    { catalogueId: built.catalogueId, detachmentIds: built.detachmentIds ?? [], picks: built.picks },
    submittedAt,
  )
  const rulesVersion = rulesVersionOf(read.catalogueId)
  const translated = rulesVersion ? withVsPicks(read, rulesVersion, translations) : read
  return translated === read ? roster : { ...roster, built: { ...built, picks: withTranslationsFrom(built.picks, translated.picks) } }
}
