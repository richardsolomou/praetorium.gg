import { nameOf, targetOf } from '../core/catalogue'
import { distance } from 'fastest-levenshtein'
import type { LoadedCatalogue } from './catalogueIndex'
import { datasheetSlug, datasheetsOf, isReferenceDatasheet } from './catalogueIndex'
import { isMatchedPlayDatasheet } from './cataloguePicker'
import { factionsFor } from './factionReferences'
import { gameReferencesFor } from './gameReferences'
import type { LoadedRules } from './rules'

/**
 * One search box over everything the app can name: factions, datasheets,
 * detachments, missions, and the player's own rosters and battles.
 *
 * Plain substring matching is the default. Datasheets alone fall back to a small,
 * token-based typo match when their group has no direct result. Every group is
 * capped and returned in a fixed order, so a two-letter query cannot bury the one
 * thing the player was reaching for under three hundred datasheets.
 */
export type GlobalSearchResult = {
  id: string
  group: 'Pages' | 'Factions' | 'Datasheets' | 'Detachments' | 'Missions' | 'Your rosters' | 'Your battles'
  label: string
  detail: string
  href: string
  /** A typo-tolerant fallback, shown separately from direct matches. */
  fuzzy?: boolean
}

/** The order results are shown in, and the most of each that is worth showing. */
const GROUPS: GlobalSearchResult['group'][] = ['Factions', 'Datasheets', 'Detachments', 'Missions', 'Your rosters', 'Your battles']
const PER_GROUP = 12

type SavedRoster = { id: string; name: string; limit: number }
type Battle = {
  token: string
  status: string
  players: string[]
  armies: (string | null)[]
  mission: { name: string } | null
}

type Sources = {
  catalogue: LoadedCatalogue | null
  rules: LoadedRules | null
  /** The signed-in player's own data, or nothing when the request carries no session. */
  own: () => Promise<{ rosters: SavedRoster[]; battles: Battle[] } | null>
}

export async function searchEverything(query: string, sources: Sources): Promise<GlobalSearchResult[]> {
  const wanted = query.toLowerCase()
  const matches = (...text: (string | null | undefined)[]) => text.filter(Boolean).join(' ').toLowerCase().includes(wanted)
  const results: GlobalSearchResult[] = [
    ...catalogueResults(wanted, matches, sources),
    ...missionResults(matches, sources.rules),
    ...(await ownResults(matches, sources.own)),
  ]
  return GROUPS.flatMap((group) => results.filter((result) => result.group === group).slice(0, PER_GROUP))
}

type Matcher = (...text: (string | null | undefined)[]) => boolean

function catalogueResults(wanted: string, matches: Matcher, sources: Sources): GlobalSearchResult[] {
  const loaded = sources.catalogue
  if (!loaded) return []

  const results: GlobalSearchResult[] = []
  const datasheets = new Map<string, { primary: GlobalSearchResult[]; allied?: GlobalSearchResult }>()
  for (const faction of factionsFor(loaded, sources.rules).factions) {
    if (matches(faction.displayName, faction.name)) {
      results.push({
        id: `faction:${faction.id}`,
        group: 'Factions',
        label: faction.displayName,
        detail: 'Faction reference',
        href: `/factions/${faction.slug}`,
      })
    }
    for (const detachment of faction.detachments) {
      if (!faction.referenceDetachmentIds.includes(detachment.id)) continue
      if (!matches(detachment.name)) continue
      results.push({
        id: `detachment:${faction.id}:${detachment.id}`,
        group: 'Detachments',
        label: detachment.name,
        detail: faction.displayName,
        href: `/factions/${faction.slug}/reference/detachments/${detachment.slug}`,
      })
    }
    for (const entryId of datasheetsOf(loaded.index, faction.id)) {
      const entry = loaded.index.definitions.get(entryId)
      if (!entry || !isMatchedPlayDatasheet(loaded.index, entry)) continue
      if (!isReferenceDatasheet(loaded, faction.id, entryId)) continue
      const name = nameOf(entry, loaded.index.definitions)
      if (!name.toLowerCase().includes(wanted)) continue
      const result: GlobalSearchResult = {
        id: `datasheet:${faction.id}:${entryId}`,
        group: 'Datasheets',
        label: name,
        detail: faction.displayName,
        href: `/factions/${faction.slug}/datasheets/${datasheetSlug(loaded, faction.id, entryId)}`,
      }
      const key = targetOf(entry, loaded.index.definitions).id
      const found = datasheets.get(key) ?? { primary: [] }
      if (loaded.index.alliedDatasheets.get(faction.id)?.has(entryId)) found.allied ??= result
      else found.primary.push(result)
      datasheets.set(key, found)
    }
  }
  const direct = datasheetResults(datasheets)
  results.push(...(direct.length ? direct : fuzzyDatasheetResults(loaded, sources.rules, wanted)))
  return results
}

const datasheetResults = (datasheets: ReadonlyMap<string, { primary: GlobalSearchResult[]; allied?: GlobalSearchResult }>) =>
  [...datasheets.values()].flatMap((found) => (found.primary.length ? found.primary : found.allied ? [found.allied] : []))

function fuzzyDatasheetResults(loaded: LoadedCatalogue, rules: LoadedRules | null, query: string) {
  const found = new Map<string, { result: GlobalSearchResult; score: number }>()
  for (const faction of factionsFor(loaded, rules).factions) {
    for (const entryId of datasheetsOf(loaded.index, faction.id)) {
      const entry = loaded.index.definitions.get(entryId)
      if (!entry || !isMatchedPlayDatasheet(loaded.index, entry) || !isReferenceDatasheet(loaded, faction.id, entryId)) continue
      const name = nameOf(entry, loaded.index.definitions)
      const score = fuzzyScore(query, name)
      if (score === null) continue
      const key = targetOf(entry, loaded.index.definitions).id
      const existing = found.get(key)
      if (existing && existing.score <= score) continue
      found.set(key, {
        score,
        result: {
          id: `datasheet:${faction.id}:${entryId}`,
          group: 'Datasheets',
          label: name,
          detail: faction.displayName,
          href: `/factions/${faction.slug}/datasheets/${datasheetSlug(loaded, faction.id, entryId)}`,
          fuzzy: true,
        },
      })
    }
  }
  return [...found.values()]
    .toSorted((left, right) => left.score - right.score || left.result.label.localeCompare(right.result.label))
    .map(({ result }) => result)
}

/** Every substantial word must be close to a word on the datasheet, avoiding broad guesses. */
function fuzzyScore(query: string, name: string) {
  const queryWords = wordsIn(query).filter((word) => word.length >= 3)
  const nameWords = wordsIn(name)
  if (!queryWords.length || !nameWords.length) return null
  let score = 0
  for (const queryWord of queryWords) {
    const nearest = Math.min(...nameWords.map((nameWord) => distance(queryWord, nameWord) / Math.max(queryWord.length, nameWord.length)))
    if (nearest > 0.34) return null
    score += nearest
  }
  return score / queryWords.length
}

const wordsIn = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g) ?? []

function missionResults(matches: Matcher, rules: LoadedRules | null): GlobalSearchResult[] {
  if (!rules) return []
  const references = gameReferencesFor(rules)
  const results: GlobalSearchResult[] = []

  for (const pack of references.packs) {
    if (matches(pack.name)) {
      results.push({
        id: `pack:${pack.id}`,
        group: 'Missions',
        label: pack.name,
        detail: 'Mission pack',
        href: `/mission-packs/${pack.id}`,
      })
    }
    for (const mission of pack.missions) {
      if (!matches(mission.name)) continue
      results.push({
        id: `mission:${pack.id}:${mission.id}`,
        group: 'Missions',
        label: mission.name,
        detail: pack.name,
        href: `/mission-packs/${pack.id}`,
      })
    }
  }

  // Secondaries are shared across packs, so they are linked through the first one.
  const firstPack = references.packs[0]
  if (!firstPack) return results
  for (const mission of references.secondaries) {
    if (!matches(mission.name)) continue
    results.push({
      id: `secondary:${mission.key}`,
      group: 'Missions',
      label: mission.name,
      detail: 'Secondary mission',
      href: `/mission-packs/${firstPack.id}`,
    })
  }
  return results
}

/** The signed-in player's own rosters and battles, which nobody else's search reaches. */
async function ownResults(matches: Matcher, own: Sources['own']): Promise<GlobalSearchResult[]> {
  const mine = await own()
  if (!mine) return []

  const results: GlobalSearchResult[] = []
  for (const roster of mine.rosters) {
    if (!matches(roster.name)) continue
    results.push({
      id: `roster:${roster.id}`,
      group: 'Your rosters',
      label: roster.name,
      detail: `${roster.limit} points`,
      href: `/rosters/${roster.id}`,
    })
  }
  for (const battle of mine.battles) {
    const label = battle.armies.filter(Boolean).join(' vs ') || battle.players.join(' vs ')
    if (!matches(label, ...battle.players, battle.mission?.name)) continue
    results.push({
      id: `battle:${battle.token}`,
      group: 'Your battles',
      label,
      detail: battle.mission?.name ?? battle.status,
      href: `/battles/${battle.token}`,
    })
  }
  return results
}
