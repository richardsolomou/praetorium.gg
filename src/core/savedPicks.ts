import { z } from 'zod'
import { vsPickSchema } from './commands'
import type { RosterPick, VsPick } from './roster'

/**
 * Frozen whole-pick translations: each saved BSData pick of a datasheet VS Data defines exactly, by `savedPickKey`, to
 * the `VsPick` it stands for, checked by VS Data's own checker when frozen (`scripts/translateSavedPicks.ts`). Each
 * publication holds the keys of one production copy, and no key ever changes meaning across publications
 * (`nextSavedPicks`); a pick with none stays on BSData. Strict, so it can hold nothing but a pick's content key and its
 * VS Data IDs.
 */
export const savedPicksSchema = z.strictObject({
  format: z.literal('praetorium.saved-picks.v1'),
  picks: z.record(z.string().regex(/^[0-9a-f]{16}$/), vsPickSchema.strict()),
})
export type SavedPicks = z.infer<typeof savedPicksSchema>

/** The published translations' object in the players' private bucket, by their SHA-256. */
export const savedPicksKey = (sha256: string) => `saved-picks/${sha256}.json`

/** The published translations' address: the object `saved-picks/<sha256>.json` in the players' private bucket. */
export const savedPicksPinSchema = z.strictObject({
  format: z.literal('praetorium.saved-picks-pin.v1'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /**
   * When the backup the translations were made from captured the database, before its freeze: nothing saved after it is
   * in that copy, so a translation attaches only to a record saved before it and unchanged since.
   */
  copiedAt: z.iso.datetime(),
})

const sameMeaning = (left: VsPick, right: VsPick) => JSON.stringify(sortedKeys(left)) === JSON.stringify(sortedKeys(right))

/**
 * Whether a record saved (or last changed) at `savedAt` may take the translations of a copy taken at `copiedAt`. A record
 * saved later never does, so saving a guessed pick can't reveal whether some private list held it.
 */
export const translatesSavedAt = (copiedAt: string, savedAt: number) => savedAt <= Date.parse(copiedAt)

/**
 * One copy's translations as the bytes to publish in place of `published`, holding that copy's keys alone, so each key
 * is dated by the copy it came from. A run stops if a key both hold would change meaning, or if a key some live record
 * of the copy still hashes to (`live`) would leave, since that record would fall back to its BSData choices, unless the
 * copy's picks read it two ways (`disputed`), which only the final publication before BSData goes must settle.
 */
export function nextSavedPicks(
  published: SavedPicks | null,
  found: SavedPicks['picks'],
  live: ReadonlySet<string>,
  disputed: ReadonlySet<string>,
): string {
  for (const [key, held] of Object.entries(published?.picks ?? {})) {
    const next = found[key]
    if (next && !sameMeaning(held, next))
      throw new Error(`saved pick ${key} is published as ${JSON.stringify(held)}; this run reads it as ${JSON.stringify(next)}`)
    if (!next && live.has(key) && !disputed.has(key))
      throw new Error(`saved pick ${key} is published and a live record still holds it; this run leaves it out`)
  }
  return `${JSON.stringify(sortedKeys(savedPicksSchema.parse({ format: 'praetorium.saved-picks.v1', picks: found })))}\n`
}

/** Where a pick stands: its rules version, its list's (or loadout's) book, and the list's Detachments. */
export type PickContext = { rulesVersion: string; catalogueId: string; detachmentIds: readonly string[] }

/** A frozen translation by key, whichever store holds them. */
export type SavedPickTranslations = (key: string) => VsPick | undefined

const sortedKeys = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, inner]) => [key, sortedKeys(inner)]),
      )
    : value

const PRIME = 0x100000001b3n
const MASK = (1n << 64n) - 1n
/** FNV-1a, 64 bits, over UTF-8: part of the frozen format, so it never changes. */
function fnv1a64(text: string) {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(text)) hash = ((hash ^ BigInt(byte)) * PRIME) & MASK
  return hash.toString(16).padStart(16, '0')
}

/**
 * A stored pick's key: everything that decides how it builds, in its rules version, book and Detachments, and nothing a
 * player names, notes, attaches or embarks. Read it on the pick as `currentRosterIds` or `fieldedRosterIds` gives it.
 */
export function savedPickKey(context: PickContext, pick: RosterPick) {
  const book = bookOf(context.catalogueId)
  // Spellings that build alike key alike: an allied book that is the list's own, a toggle off, an empty record.
  const allied = pick.catalogueId && bookOf(pick.catalogueId) !== book ? bookOf(pick.catalogueId) : null
  const toggles = Object.fromEntries(Object.entries(pick.toggles ?? {}).filter(([, on]) => on))
  const filled = <T extends object>(value: T | undefined) => (value && Object.keys(value).length ? value : null)
  return fnv1a64(
    JSON.stringify(
      sortedKeys({
        rulesVersion: context.rulesVersion,
        book,
        detachments: context.detachmentIds.toSorted(),
        pick: {
          entryId: pick.entryId,
          catalogueId: allied,
          models: pick.models ?? null,
          choices: filled(pick.choices),
          spreads: filled(pick.spreads),
          toggles: filled(toggles),
          floor: pick.floor ?? null,
        },
      }),
    ),
  )
}

const bookOf = (catalogueId: string) => catalogueId.slice(catalogueId.indexOf('~') + 1)

export function savedPickTranslations(raw: unknown): SavedPickTranslations {
  const picks = new Map(Object.entries(savedPicksSchema.parse(raw).picks))
  return (key) => picks.get(key)
}

/** The list with each pick's frozen translation attached as `vs`; a pick that holds its own keeps it, and nothing else changes. */
export function withVsPicks<T extends { catalogueId: string; detachmentIds: readonly string[]; picks: readonly RosterPick[] }>(
  list: T,
  rulesVersion: string,
  translationOf: SavedPickTranslations,
): T {
  const context = { rulesVersion, catalogueId: list.catalogueId, detachmentIds: list.detachmentIds }
  let attached = false
  const picks = list.picks.map((pick) => {
    const vs = pick.vs ? undefined : translationOf(savedPickKey(context, pick))
    if (!vs) return pick
    attached = true
    return { ...pick, vs }
  })
  return attached ? { ...list, picks } : list
}

/**
 * A saved loadout with each of its units' frozen models and wargear attached, all a loadout keeps by VS Data IDs. Read
 * it as the freeze did: through `currentRosterIds` with no Detachments, dated by when it was saved.
 */
export function withVsLoadout<T extends { catalogueId: string; pick: RosterPick; joined?: readonly RosterPick[] }>(
  loadout: T,
  rulesVersion: string,
  translationOf: SavedPickTranslations,
): T {
  const read = (pick: RosterPick) => {
    const vs = pick.vs
      ? undefined
      : translationOf(savedPickKey({ rulesVersion, catalogueId: loadout.catalogueId, detachmentIds: [] }, pick))
    return vs ? { ...pick, vs: { models: vs.models, options: vs.options } } : pick
  }
  return { ...loadout, pick: read(loadout.pick), ...(loadout.joined ? { joined: loadout.joined.map(read) } : {}) }
}
