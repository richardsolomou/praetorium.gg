import { z } from 'zod'
import { loadCatalogue } from '../../src/server/catalogueIndex'
import rawAccepted from '../../catalogue/accepted-id-drops.json' with { type: 'json' }
import { nameOf, resolve, type CatalogueIndex } from '../../src/core/catalogue'
import type { CatalogueHistoryEntry } from '../../src/core/catalogueHistory'
import { childrenOf, MAX_DEPTH } from '../../src/core/definitions'
import { currentCatalogueId, currentDetachmentId, currentEntryId, migratedCatalogueIds } from '../../src/core/retiredCatalogueIds'
import { type LoadedCatalogue, datasheetsOf } from '../../src/shared/catalogueIndex'
import { nameOverlap, normalized, removedNamesOf } from '../../src/shared/importMismatch'

/**
 * The IDs a saved roster can hold that one snapshot has and the next drops, and whether each is handled.
 *
 * A saved pick holds IDs only, so an ID the next snapshot drops is a selection that silently stops resolving
 * unless `catalogue/roster-migrations.json` (or another map `currentRosterIds` applies) moves it, or it really
 * left the game, which the data-update history records by name. A dropped ID whose name, or nearly its name,
 * is still offered in the same scope is a rename the maps must carry, whatever the history says.
 */

type Kind = 'faction' | 'datasheet' | 'detachment' | 'enhancement' | 'option'
type Named = ReadonlyMap<string, string>

/** What a saved roster can name in a catalogue, by the IDs it stores. */
export type SavedIds = {
  factions: Named
  datasheets: ReadonlyMap<string, Named>
  detachments: ReadonlyMap<string, Named>
  /** Every enhancement name the cards print, normalized, which tells an enhancement from other options. */
  enhancements: ReadonlySet<string>
  /** Every ID a saved choice, spread or toggle under this datasheet can hold, whole or as a key segment. */
  options: (entryId: string) => Named
}

export type IdDrop = {
  kind: Kind
  /** The faction for a faction, datasheet, detachment or enhancement; the datasheet for an option. */
  scope: string
  scopeName: string
  id: string
  name: string
  /**
   * `renamed`: a new ID in the same scope carries a near-identical name. `reissued`: the same name is still offered
   * under another ID. `unrecorded`: gone by name too, but the data-update history does not record it as removed.
   * `unresolved`: a map moves it to an ID the new snapshot lacks. `removed`: left the game.
   */
  verdict: 'renamed' | 'reissued' | 'unrecorded' | 'unresolved' | 'removed'
  to?: { id: string; name: string }
  accepted?: string
}

const acceptedSchema = z.array(
  z.object({
    kind: z.enum(['faction', 'datasheet', 'detachment', 'enhancement', 'option']),
    id: z.string(),
    name: z.string(),
    reason: z.string().min(1),
  }),
)
const acceptedKey = (drop: Pick<IdDrop, 'kind' | 'id'>) => JSON.stringify([drop.kind, drop.id])
const ACCEPTED = new Map(acceptedSchema.parse(rawAccepted).map((entry) => [acceptedKey(entry), entry.reason]))

export const failsCheck = (drop: IdDrop) => drop.verdict !== 'removed' && !drop.accepted

function optionIds(entryId: string, index: CatalogueIndex): Named {
  const found = new Map<string, string>()
  const root = index.definitions.get(entryId)
  const walk = (definition: NonNullable<typeof root>, depth: number) => {
    for (const child of childrenOf(definition, index)) {
      if (found.has(child.id)) continue
      found.set(child.id, nameOf(child.definition, index.definitions))
      if (depth < MAX_DEPTH) walk(resolve(child.definition, index), depth + 1)
    }
  }
  if (root) walk(resolve(root, index), 0)
  return found
}

export function savedIdsOf(loaded: LoadedCatalogue): SavedIds {
  const { index } = loaded
  const name = (id: string) => {
    const definition = index.definitions.get(id)
    return definition ? nameOf(definition, index.definitions) : id
  }
  const options = new Map<string, Named>()
  return {
    factions: new Map(loaded.factions.map((faction) => [faction.id, faction.name])),
    datasheets: new Map(
      loaded.factions.map((faction) => [faction.id, new Map([...datasheetsOf(index, faction.id)].map((id) => [id, name(id)]))]),
    ),
    detachments: new Map(
      [...loaded.detachments].map(([catalogueId, held]) => [catalogueId, new Map(held.options.map((option) => [option.id, option.name]))]),
    ),
    enhancements: new Set(
      [...loaded.factionContents.values()].flatMap((content) =>
        [...content.enhancements.values()].flatMap((cards) => cards.map((card) => normalized(card.name))),
      ),
    ),
    options: (entryId) => {
      let found = options.get(entryId)
      if (!found) options.set(entryId, (found = optionIds(entryId, index)))
      return found
    },
  }
}

/**
 * The added record sharing at least two thirds of its words with `name`: a dropped article or number, a plural,
 * a word added. Looser reads "Anvil Siege Force" as "Gravis Siege Force", which are different detachments.
 */
function nearName(name: string, candidates: readonly [string, string][]) {
  let best: { id: string; name: string; score: number } | null = null
  for (const [id, candidate] of candidates) {
    const score = nameOverlap(name, candidate)
    if (score > (best?.score ?? 0)) best = { id, name: candidate, score }
  }
  return best && best.score >= 2 / 3 ? { id: best.id, name: best.name } : null
}

type Options = {
  history: readonly Pick<CatalogueHistoryEntry, 'recordedAt' | 'changes'>[]
  /** The IDs the migration files move; tests pass their own. */
  migrated?: ReadonlySet<string>
  accepted?: ReadonlyMap<string, string>
}

export function idDrops(before: SavedIds, after: SavedIds, { history, migrated = migratedCatalogueIds(), accepted = ACCEPTED }: Options) {
  const removed = removedNamesOf(history)
  const drops: IdDrop[] = []
  /** The history names a book by its ID at the time, which a map may since have moved, and records an imported datasheet or detachment under any book offering it. */
  const recorded = (kind: Kind, catalogueIds: readonly string[], name: string) =>
    catalogueIds.some((id) => [id, currentCatalogueId(id)].some((book) => removed.get(book)?.get(normalized(name))?.kind === kind))
  /**
   * One scope's dropped IDs. A mapped one only needs its target to exist; the rest are renames when a new ID
   * carries the name or nearly it, and otherwise removals, which the history must record unless they are options.
   */
  const compare = (
    scope: { id: string; name: string },
    booksOf: (id: string) => readonly string[],
    old: Named,
    next: Named,
    kindOf: (name: string) => Kind,
    current: (id: string) => string = (id) => id,
  ) => {
    const added = [...next].filter(([id]) => !old.has(id))
    // A new ID is the likelier successor, but a group folded into another keeps the survivor's.
    const byName = new Map([...next, ...added].map(([id, name]) => [normalized(name), { id, name }]))
    for (const [id, name] of old) {
      if (next.has(id)) continue
      const kind = kindOf(name)
      const drop = { kind, scope: scope.id, scopeName: scope.name, id, name }
      const reason = accepted.get(acceptedKey(drop))
      const push = (judged: Pick<IdDrop, 'verdict' | 'to'>) => drops.push({ ...drop, ...judged, ...(reason ? { accepted: reason } : {}) })
      if (migrated.has(id)) {
        const target = current(id)
        if (target !== id && !next.has(target)) push({ verdict: 'unresolved', to: { id: target, name: '' } })
        continue
      }
      const to = byName.get(normalized(name)) ?? nearName(name, added)
      if (to) push({ verdict: normalized(to.name) === normalized(name) ? 'reissued' : 'renamed', to })
      else if (kind === 'option' || (kind !== 'faction' && recorded(kind, booksOf(id), name))) push({ verdict: 'removed' })
      else push({ verdict: 'unrecorded' })
    }
  }

  const offering = (records: SavedIds['datasheets']) => {
    const books = new Map<string, string[]>()
    for (const [catalogueId, held] of records) for (const id of held.keys()) books.set(id, [...(books.get(id) ?? []), catalogueId])
    return (id: string) => books.get(id) ?? []
  }
  const datasheetBooks = offering(before.datasheets)
  const detachmentBooks = offering(before.detachments)
  compare(
    { id: '', name: '' },
    () => [],
    before.factions,
    after.factions,
    () => 'faction',
    currentCatalogueId,
  )
  const datasheets = new Map<string, { current: string; name: string }>()
  for (const [catalogueId, sheets] of before.datasheets) {
    const target = currentCatalogueId(catalogueId)
    const next = after.datasheets.get(target) ?? new Map<string, string>()
    const faction = { id: catalogueId, name: before.factions.get(catalogueId) ?? catalogueId }
    compare(faction, datasheetBooks, sheets, next, () => 'datasheet', currentEntryId)
    const detachments = after.detachments.get(target) ?? new Map<string, string>()
    compare(
      faction,
      detachmentBooks,
      before.detachments.get(catalogueId) ?? new Map(),
      detachments,
      () => 'detachment',
      currentDetachmentId,
    )
    for (const [id, name] of sheets) {
      const current = next.has(id) ? id : currentEntryId(id)
      if (next.has(current)) datasheets.set(id, { current, name })
    }
  }
  for (const [id, { current, name }] of datasheets) {
    const books = datasheetBooks(id)
    const kindOf = (option: string) => (before.enhancements.has(normalized(option)) ? 'enhancement' : 'option')
    compare({ id, name }, () => books, before.options(id), after.options(current), kindOf)
  }
  return drops
}

/** One line per dropped ID, however many datasheets offered it. */
export function idDropReport(drops: readonly IdDrop[]) {
  const grouped = new Map<string, { drop: IdDrop; scopes: Set<string> }>()
  for (const drop of drops) {
    const key = JSON.stringify([drop.verdict, drop.kind, drop.id, drop.to?.id])
    const held = grouped.get(key) ?? { drop, scopes: new Set() }
    held.scopes.add(drop.scopeName)
    grouped.set(key, held)
  }
  return [...grouped.values()].map(({ drop, scopes }) => {
    const where = [...scopes].slice(0, 3).join(', ') + (scopes.size > 3 ? ` and ${scopes.size - 3} more` : '')
    const to = drop.to ? ` -> ${drop.to.id}${drop.to.name ? ` "${drop.to.name}"` : ''}` : ''
    return `${drop.accepted ? 'accepted ' : ''}${drop.verdict} ${drop.kind} ${drop.id} "${drop.name}"${to} in ${where}`
  })
}

/** The dropped IDs between two catalogue directories' base rules; retained rules versions are pinned and never move. */
export function catalogueIdDrops(previous: string, next: string, history: Options['history']) {
  const before = loadCatalogue(previous)
  const after = loadCatalogue(next)
  if (!before || !after) throw new Error('Both catalogues must load to compare their saved IDs')
  return idDrops(savedIdsOf(before), savedIdsOf(after), { history })
}

/** Fails when `next` drops a saved ID no map carries and no acceptance excuses, after logging every dropped ID. */
export function checkIdDrops(previous: string, next: string, history: Options['history'], log: (line: string) => void = console.log) {
  const drops = catalogueIdDrops(previous, next, history)
  const lines = idDropReport(drops)
  const failing = idDropReport(drops.filter(failsCheck))
  log(`Saved IDs: ${lines.length} dropped, ${failing.length} unhandled`)
  for (const line of lines) log(`  ${line}`)
  if (failing.length)
    throw new Error(
      `${failing.length} saved IDs dropped without a migration:\n${failing.join('\n')}\nMap what saved rosters hold in catalogue/roster-migrations.json, and accept the rest with scripts/catalogueIdDrops.ts --accept.`,
    )
}
