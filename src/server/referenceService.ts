import type { CanonicalDatasheet, CanonicalDetachment, UnitSummary } from '../contracts/catalogue'
import type { ReferenceDocument } from '../contracts/reference'
import type { DatasheetRelationship } from '../core/datasheet'
import { routeSlug } from '../core/slug'
import { publishedFacts } from '../core/sourceText'
import { byId, countBy, remember } from '../core/collections'
import { catalogueEditionId } from '../core/catalogueEdition'
import { joinKey } from '../core/text'
import { fuzzyNameScore } from '../core/datasheetSearch'
import { datasheetPageBySlug } from '../core/datasheetSlug'
import { unitsIn } from '../shared/cataloguePicker'
import { entryFactions } from '../shared/catalogueIndex'
import type { LoadedCatalogue } from './catalogueIndex'
import { factionDisplayName } from '../shared/factionNames'
import { dispositionMatchups, gameReferencesFor, matchupMission } from '../shared/gameReferences'
import { detachmentsOffering, type DispositionFaction } from '../shared/factionReferences'
import { terrainMatchupIds } from '../contracts/terrainReference'
import { datasheetRoute, type ReferenceCorpus } from './referenceCorpus'
import type { LoadedRules } from './rules'

export type ReferenceFaction = { id: string; slug: string; name: string; datasheets: number; detachments: number }

export function referenceFactions(corpus: ReferenceCorpus): ReferenceFaction[] {
  const factions = new Map<string, ReferenceFaction>()
  for (const sheet of corpus.catalogue.datasheets) {
    const slug = sheet.referenceRoute?.catalogueId ?? sheet.catalogueId
    remember(factions, sheet.catalogueId, () => ({
      id: sheet.catalogueId,
      slug,
      name: sheet.faction,
      datasheets: 0,
      detachments: 0,
    })).datasheets += 1
  }
  for (const detachment of corpus.catalogue.detachments) {
    remember(factions, detachment.catalogueId, () => ({
      id: detachment.catalogueId,
      slug: detachment.factionSlug,
      name: detachment.faction,
      datasheets: 0,
      detachments: 0,
    })).detachments += 1
  }
  return [...factions.values()].toSorted((left, right) => left.name.localeCompare(right.name))
}

export function referenceIndex(corpus: ReferenceCorpus) {
  const kinds = Object.fromEntries(countBy(corpus.documents, (document) => document.kind))
  return {
    corpusRevision: corpus.revision,
    revisions: corpus.catalogue.revisions,
    kinds,
    factions: referenceFactions(corpus),
    missionPacks: corpus.documents.filter((document) => document.id.startsWith('mission-pack:')).map(documentSummary),
    ruleDocuments: corpus.catalogue.ruleDocuments.map((document) => ({
      id: document.id,
      slug: document.slug,
      title: document.title,
      sections: document.sections.length,
      url: `/rules/${document.slug}`,
    })),
  }
}

const documentSummary = (document: ReferenceDocument) => ({ id: document.id, title: document.title, url: document.url })

export type ReferenceUnitsQuery = { battleSize?: number; detachment?: string; nonMatchedPlay?: boolean; query?: string }

export function referenceUnits(
  corpus: ReferenceCorpus,
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  faction: string,
  { battleSize, detachment, nonMatchedPlay = false, query }: ReferenceUnitsQuery = {},
  currentCatalogueIds: ReadonlySet<string> = new Set(),
) {
  const foundFaction = referenceFaction(corpus, faction)
  if (!foundFaction) return null
  const sheets = factionDatasheets(corpus, loaded, foundFaction.id, currentCatalogueIds)
  const selectedDetachment = detachment ? referenceDetachment(corpus, loaded, foundFaction.id, detachment, currentCatalogueIds) : null
  if (detachment && !selectedDetachment) return null
  const detachmentIds = selectedDetachment ? [selectedDetachment.id] : []
  const wanted = query?.trim().toLocaleLowerCase()
  const offered = factionUnits(loaded, rules, foundFaction, { battleSize, detachmentIds, nonMatchedPlay })
  const offeredIds = new Set(offered.map((unit) => unit.id))
  const all = offered.map((unit) => unitReference(corpus, unit, sheets.get(unit.id), offeredIds))
  const units = wanted ? queriedUnits(all, wanted) : all
  return {
    faction: foundFaction,
    battleSize: battleSize ?? null,
    nonMatchedPlay,
    query: wanted || null,
    detachment: selectedDetachment,
    detachments: selectedDetachment
      ? null
      : factionDetachments(corpus, loaded, foundFaction.id, currentCatalogueIds).map(detachmentOverview),
    units,
    revisions: corpus.catalogue.revisions,
  }
}

/** The units whose name or keywords contain the query, or else those whose names are close to a mistyped one. */
function queriedUnits<T extends { name: string; keywords: readonly string[] }>(units: readonly T[], wanted: string) {
  const containing = units.filter((unit) => [unit.name, ...unit.keywords].some((value) => value.toLocaleLowerCase().includes(wanted)))
  if (containing.length) return containing
  return units
    .flatMap((unit) => {
      const score = fuzzyNameScore(wanted, unit.name)
      return score === null ? [] : [{ unit, score }]
    })
    .toSorted((left, right) => left.score - right.score)
    .map(({ unit }) => unit)
}

/** The units a faction's lists can take, as list_units offers them. */
export function factionUnits(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  faction: ReferenceFaction,
  options: { battleSize?: number; detachmentIds?: readonly string[]; nonMatchedPlay?: boolean } = {},
) {
  const book = loaded.factions.find((entry) => entry.id === faction.id)
  const displayName = book ? factionDisplayName(book.name, rules?.factionNames) : faction.name
  const restrictions = rules?.factionRestrictions.get(routeSlug(displayName))
  return unitsIn(loaded, faction.id, '', { restrictions, ...options })
}

/** The names of the detachments a faction's lists can take, including any its codex holds. */
export const factionDetachmentNames = (loaded: LoadedCatalogue, factionId: string) =>
  (loaded.detachments.get(factionId)?.options ?? []).map((option) => option.name)

/**
 * The datasheet behind each unit a faction offers: its own, or else the copy filed under the
 * catalogue that owns the entry at the same rules version, as a chapter fields Intercessors and an
 * army fields an assassin from Agents of the Imperium. A shared library owns some entries and files
 * no pages, so several factions hold copies; the copy of the one faction the entry's Faction keyword
 * names wins, as an Armiger cites Imperial Knights. Another faction's copy stands in only when it is
 * the one copy at that version; otherwise the unit has no citation rather than a wrong one.
 */
export function factionDatasheets(
  corpus: ReferenceCorpus,
  loaded: LoadedCatalogue,
  factionId: string,
  currentCatalogueIds: ReadonlySet<string>,
) {
  const sameVersion = sameRulesVersion(factionId, currentCatalogueIds)
  const copies = new Map<string, CanonicalDatasheet[]>()
  const sheets = new Map<string, CanonicalDatasheet>()
  for (const sheet of corpus.catalogue.datasheets) {
    if (sheet.catalogueId === factionId) sheets.set(sheet.id, sheet)
    else if (sameVersion(sheet.catalogueId)) remember(copies, sheet.id, () => []).push(sheet)
  }
  for (const [id, candidates] of copies) {
    if (sheets.has(id)) continue
    const owner = loaded.index.catalogueOf.get(id)
    const owned = owner ? candidates.filter((sheet) => bookId(sheet.catalogueId) === bookId(owner)) : []
    const named = entryFactions(loaded, id)
    const keyworded = named.size === 1 ? candidates.filter((sheet) => named.has(catalogueFaction(loaded, sheet.catalogueId))) : []
    const chosen = owned.length ? owned : keyworded.length ? keyworded : candidates
    if (chosen.length === 1) sheets.set(id, chosen[0]!)
  }
  return sheets
}

/** A catalogue id without the rules version that may prefix it. */
const bookId = (catalogueId: string) => catalogueId.slice(catalogueId.indexOf('~') + 1)

const catalogueFaction = (loaded: LoadedCatalogue, catalogueId: string) =>
  factionDisplayName((loaded.index.catalogues.get(catalogueId) ?? loaded.index.catalogues.get(bookId(catalogueId)))?.name ?? '')

/** Whether a catalogue holds the rules version a faction reads: its edition's, or for a current faction the current ones. */
function sameRulesVersion(factionId: string, currentCatalogueIds: ReadonlySet<string>) {
  const edition = catalogueEditionId(factionId)
  return (catalogueId: string) => catalogueEditionId(catalogueId) === edition || (!edition && currentCatalogueIds.has(catalogueId))
}

/**
 * A faction by the id, URL slug, or display name an agent read from the reference. A plain name
 * takes current rules and ignores case, punctuation, and apostrophes, so "Tau Empire" finds T’au Empire.
 */
export function referenceFaction(corpus: ReferenceCorpus, faction: string) {
  const wanted = faction.trim().toLocaleLowerCase()
  const key = joinKey(faction)
  const factions = referenceFactions(corpus)
  return (
    factions.find((candidate) => [candidate.id, candidate.slug, candidate.name].some((value) => value.toLocaleLowerCase() === wanted)) ??
    factions.find(
      (candidate) =>
        !candidate.name.includes(' · Preview') &&
        !candidate.name.includes(' · Archived') &&
        joinKey(candidate.name.split(' · ')[0]!) === key,
    )
  )
}

/**
 * A detachment the faction's lists can take, including one its codex holds, such as Gladius for a
 * chapter. Every rules version keeps its own copy under the same id: a versioned faction takes its
 * version's, and a current faction takes the codex's current one, which may itself be versioned.
 */
function referenceDetachment(
  corpus: ReferenceCorpus,
  loaded: LoadedCatalogue,
  factionId: string,
  detachment: string,
  currentCatalogueIds: ReadonlySet<string>,
) {
  const wanted = detachment.trim().toLocaleLowerCase()
  const offered = new Set((loaded.detachments.get(factionId)?.options ?? []).map((option) => option.id))
  const named = corpus.catalogue.detachments.filter((candidate) =>
    [candidate.id, candidate.slug, candidate.name].some((value) => value.toLocaleLowerCase() === wanted),
  )
  const sameVersion = sameRulesVersion(factionId, currentCatalogueIds)
  return (
    named.find((candidate) => candidate.catalogueId === factionId) ??
    named.find((candidate) => offered.has(candidate.id) && sameVersion(candidate.catalogueId))
  )
}

/** Every detachment a faction's lists can take, each in the rules version referenceDetachment would read. */
function factionDetachments(corpus: ReferenceCorpus, loaded: LoadedCatalogue, factionId: string, currentCatalogueIds: ReadonlySet<string>) {
  const sameVersion = sameRulesVersion(factionId, currentCatalogueIds)
  return (loaded.detachments.get(factionId)?.options ?? []).flatMap((option) => {
    const copies = corpus.catalogue.detachments.filter((candidate) => candidate.id === option.id)
    const found =
      copies.find((candidate) => candidate.catalogueId === factionId) ?? copies.find((candidate) => sameVersion(candidate.catalogueId))
    return found ? [found] : []
  })
}

/** What an agent compares detachments by before choosing one; list_units with that detachment gives the rest. */
const detachmentOverview = (detachment: CanonicalDetachment) => ({
  name: detachment.name,
  points: detachment.points,
  dispositions: detachment.dispositions,
  rules: detachment.rules.map((rule) => rule.name),
  enhancements: detachment.enhancements.map(({ name, points }) => ({ name, points })),
  referenceId: `detachment:${detachment.factionSlug}:${detachment.slug}`,
})

/** Where a datasheet is read: its canonical page and the id get_reference_record accepts. */
export function datasheetCitation(corpus: ReferenceCorpus, sheet: CanonicalDatasheet | undefined) {
  if (!sheet) return { url: null, referenceId: null }
  const route = datasheetRoute(sheet)
  const referenceId = `datasheet:${route.catalogueId}:${route.slug}`
  return {
    url: corpus.byId.get(referenceId)?.url ?? `/factions/${route.catalogueId}/datasheets/${route.slug}`,
    referenceId,
  }
}

function unitReference(corpus: ReferenceCorpus, unit: UnitSummary, sheet: CanonicalDatasheet | undefined, offered: ReadonlySet<string>) {
  // A relationship names only a unit this list can take, so a Legends leader stays out of a matched play list.
  const names = (relationships: readonly DatasheetRelationship[]) =>
    relationships
      .filter((relationship) => !relationship.entryId || offered.has(relationship.entryId))
      .map((relationship) => relationship.name)
  return {
    ...unit,
    keywords: sheet?.keywords ?? [],
    // Composition is often withheld rules text, which would publish as empty strings.
    composition: (sheet?.composition ?? []).map(publishedFacts).filter(Boolean),
    // Most costs apply to any list, so a condition is named only where one applies.
    costs: (sheet?.costs ?? []).map(({ keyword, faction, detachment, ...cost }) => ({
      ...cost,
      ...(keyword ? { keyword } : {}),
      ...(faction ? { faction } : {}),
      ...(detachment ? { detachment } : {}),
    })),
    canLead: names(sheet?.attachments.filter((relationship) => relationship.kind === 'leader') ?? []),
    canSupport: names(sheet?.attachments.filter((relationship) => relationship.kind === 'support') ?? []),
    canBeLedBy: names(sheet?.leaders ?? []),
    canBeSupportedBy: names(sheet?.supporters ?? []),
    ...datasheetCitation(corpus, sheet),
  }
}

export const referenceRecordCatalogueId = (id: string) => /^(?:datasheet|detachment):([^:]+):/.exec(id)?.[1]

export function referenceRecord(
  corpus: ReferenceCorpus,
  rules: LoadedRules | null,
  id: string,
  factions: readonly DispositionFaction[] = [],
) {
  if (id.startsWith('datasheet:')) return datasheetRecord(corpus, id)
  const document = corpus.byId.get(id)
  if (!document) return null
  const references = rules ? gameReferencesFor(rules) : null
  let data: unknown = document
  if (id.startsWith('detachment:')) {
    const [, factionSlug, slug] = id.split(':')
    data = corpus.catalogue.detachments.find((candidate) => candidate.factionSlug === factionSlug && candidate.slug === slug)
  } else if (id.startsWith('mission-pack:') && references) {
    const packId = id.slice('mission-pack:'.length)
    const pack = references.packs.find((candidate) => candidate.id === packId)
    data = pack ? { ...pack, dispositions: references.dispositions, secondaries: references.secondaries.map(cardSummary) } : null
  } else if (id.startsWith('mission:secondary:') && references) {
    data = references.secondaries.find((candidate) => candidate.key === id.slice('mission:secondary:'.length))
  } else if (id.startsWith('mission:') && references) {
    const [, packId, missionId] = id.split(':')
    const mission = references.packs.find((candidate) => candidate.id === packId)?.missions.find((candidate) => candidate.id === missionId)
    data = mission ? { ...mission, setups: missionSetups(corpus, rules, mission.matchups) } : null
  } else if (id.startsWith('disposition:') && references) {
    const disposition = references.dispositions.find((candidate) => candidate.id === id.slice('disposition:'.length))
    data = disposition ? dispositionRecord(corpus, references, disposition, factions) : null
  } else if (id.startsWith('deployment:') && rules) {
    data = rules.deployments.find((candidate) => candidate.id === id.slice('deployment:'.length))
  } else if (id.startsWith('terrain:') && rules) {
    data = rules.terrainLayouts.find((candidate) => candidate.id === id.slice('terrain:'.length))
  }
  return data ? { document, data } : null
}

/** A datasheet record by its id, or by an id it had before its page's slug gained or lost an id suffix. */
function datasheetRecord(corpus: ReferenceCorpus, id: string) {
  const [, catalogueId, slug = ''] = id.split(':')
  const pages = corpus.catalogue.datasheets.flatMap((sheet) => {
    const route = datasheetRoute(sheet)
    return route.catalogueId === catalogueId ? [{ id: sheet.id, slug: route.slug, sheet }] : []
  })
  const page = datasheetPageBySlug(pages, slug)
  const document = page && corpus.byId.get(`datasheet:${catalogueId}:${page.slug}`)
  return document ? { document, data: page.sheet } : null
}

const cardSummary = (card: GameReferences['secondaries'][number]) => ({ id: card.key, name: card.name })
type GameReferences = ReturnType<typeof gameReferencesFor>

function missionSetups(corpus: ReferenceCorpus, rules: LoadedRules | null, matchups: GameReferencePack['missions'][number]['matchups']) {
  if (!rules) return []
  return matchups.flatMap(([you, opponent]) =>
    you && opponent ? [{ you, opponent, ...matchupSetup(corpus, rules, you.id, opponent.id) }] : [],
  )
}

/** The terrain layouts two force dispositions play on, and the deployments those layouts use. */
function matchupSetup(corpus: ReferenceCorpus, rules: LoadedRules, you: string, opponent: string) {
  const deployments = byId(rules.deployments)
  const matchupIds = terrainMatchupIds([you, opponent])
  const terrain = rules.terrainLayouts
    .filter((layout) => matchupIds.includes(layout.matchupId))
    .map((layout) => ({
      id: layout.id,
      name: layout.name,
      variant: layout.variant,
      deploymentId: layout.deploymentId,
      referenceId: `terrain:${layout.id}`,
      url: corpus.byId.get(`terrain:${layout.id}`)?.url ?? null,
    }))
  const deploymentIds = new Set(terrain.flatMap((layout) => (layout.deploymentId ? [layout.deploymentId] : [])))
  return {
    terrain,
    deployments: [...deploymentIds].map((deploymentId) => ({
      id: deploymentId,
      name: deployments.get(deploymentId)?.name ?? deploymentId,
      referenceId: `deployment:${deploymentId}`,
      url: corpus.byId.get(`deployment:${deploymentId}`)?.url ?? null,
    })),
  }
}

const matchupUrl = (packId: string, you: string, opponent: string) => `/missions/${packId}/matchups/${you}/${opponent}`

/** A primary mission as it is cited on the page of the pairing that plays it. */
const missionCitation = (packId: string, you: string, opponent: string, mission: GameReferencePack['missions'][number]) => ({
  id: mission.id,
  name: mission.name,
  referenceId: `mission:${packId}:${mission.id}`,
  url: `${matchupUrl(packId, you, opponent)}#mission-${mission.id}`,
})

function dispositionRecord(
  corpus: ReferenceCorpus,
  references: GameReferences,
  disposition: GameReferences['dispositions'][number],
  factions: readonly DispositionFaction[],
) {
  return {
    ...disposition,
    packs: dispositionMatchups(references, disposition.id).map(({ pack, matchups }) => ({
      id: pack.id,
      name: pack.name,
      referenceId: `mission-pack:${pack.id}`,
      matchups: matchups.map(({ opponent, mission }) => ({
        opponent: { id: opponent.id, name: opponent.name },
        url: matchupUrl(pack.id, disposition.id, opponent.id),
        mission: missionCitation(pack.id, disposition.id, opponent.id, mission),
      })),
    })),
    detachments: detachmentsOffering(factions, disposition.id).flatMap((faction) =>
      faction.detachments.map((detachment) => {
        const referenceId = `detachment:${faction.slug}:${detachment.slug}`
        return {
          faction: faction.displayName,
          name: detachment.name,
          points: detachment.points,
          referenceId,
          url: corpus.byId.get(referenceId)?.url ?? `/factions/${faction.slug}/detachments/${detachment.slug}`,
        }
      }),
    ),
  }
}

type Named = { id: string; name: string }

/** The one candidate a value names by id, slug, or name, exactly or else as part of one; otherwise why none is chosen. */
function namedIn<T extends Named>(candidates: readonly T[], value: string, label: string): { found: T } | { error: string } {
  const key = joinKey(value)
  const keys = (candidate: T) => [joinKey(candidate.id), joinKey(candidate.name)]
  const exact = candidates.filter((candidate) => keys(candidate).includes(key))
  const matches = exact.length ? exact : candidates.filter((candidate) => key && keys(candidate).some((entry) => entry.includes(key)))
  if (matches.length === 1) return { found: matches[0]! }
  const options = (matches.length ? matches : candidates).map((candidate) => `${candidate.name} (${candidate.id})`).join(', ')
  return {
    error: matches.length
      ? `${value} could be more than one ${label}: ${options}.`
      : `No ${label} is named ${value}. Use one of: ${options || 'none'}.`,
  }
}

export type MissionMatchupQuery = { pack: string; yourDisposition: string; opponentDisposition: string }

/** Each side's primary mission for a pairing in a pack, and the terrain and deployments it is played on. */
export function missionMatchup(corpus: ReferenceCorpus, rules: LoadedRules, query: MissionMatchupQuery) {
  const references = gameReferencesFor(rules)
  const pack = namedIn(references.packs, query.pack, 'mission pack')
  if ('error' in pack) return pack
  const you = namedIn(references.dispositions, query.yourDisposition, 'force disposition')
  if ('error' in you) return you
  const opponent = namedIn(references.dispositions, query.opponentDisposition, 'force disposition')
  if ('error' in opponent) return opponent
  const ids = [pack.found.id, you.found.id, opponent.found.id] as const
  const packDocument = corpus.byId.get(`mission-pack:${pack.found.id}`)
  const yours = matchupMission(pack.found, you.found.id, opponent.found.id)
  const theirs = matchupMission(pack.found, opponent.found.id, you.found.id)
  if (!yours || !theirs) return { error: `${pack.found.name} has no mission for ${you.found.name} vs ${opponent.found.name}.` }
  const side = (disposition: Named, mission: typeof yours) => {
    const { matchups: _, ...card } = mission
    return {
      disposition: {
        id: disposition.id,
        name: disposition.name,
        referenceId: `disposition:${disposition.id}`,
        url: `/force-dispositions/${disposition.id}`,
      },
      mission: { ...card, ...missionCitation(...ids, mission) },
    }
  }
  return {
    matchup: {
      pack: { id: pack.found.id, name: pack.found.name, referenceId: `mission-pack:${pack.found.id}`, url: `/missions/${pack.found.id}` },
      url: matchupUrl(...ids),
      you: side(you.found, yours),
      opponent: side(opponent.found, theirs),
      ...matchupSetup(corpus, rules, you.found.id, opponent.found.id),
      revisions: packDocument?.revisions ?? corpus.catalogue.revisions,
      attribution: packDocument?.attribution ?? [],
    },
  }
}

type GameReferencePack = GameReferences['packs'][number]
