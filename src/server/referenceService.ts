import type { CanonicalDatasheet, UnitSummary } from '../contracts/catalogue'
import type { ReferenceDocument, ReferenceKind } from '../contracts/reference'
import { routeSlug } from '../core/slug'
import { unitsIn } from './cataloguePicker'
import type { LoadedCatalogue } from './catalogueIndex'
import { factionDisplayName } from './factionNames'
import { gameReferencesFor } from './gameReferences'
import type { ReferenceCorpus } from './referenceCorpus'
import type { LoadedRules } from './rules'

export type ReferenceFaction = { id: string; slug: string; name: string; datasheets: number; detachments: number }

export function referenceFactions(corpus: ReferenceCorpus): ReferenceFaction[] {
  const factions = new Map<string, ReferenceFaction>()
  for (const sheet of corpus.catalogue.datasheets) {
    const slug = sheet.referenceRoute?.catalogueId ?? sheet.catalogueId
    const found = factions.get(sheet.catalogueId) ?? { id: sheet.catalogueId, slug, name: sheet.faction, datasheets: 0, detachments: 0 }
    found.datasheets += 1
    factions.set(sheet.catalogueId, found)
  }
  for (const detachment of corpus.catalogue.detachments) {
    const found = factions.get(detachment.catalogueId) ?? {
      id: detachment.catalogueId,
      slug: detachment.factionSlug,
      name: detachment.faction,
      datasheets: 0,
      detachments: 0,
    }
    found.detachments += 1
    factions.set(detachment.catalogueId, found)
  }
  return [...factions.values()].toSorted((left, right) => left.name.localeCompare(right.name))
}

export function referenceIndex(corpus: ReferenceCorpus) {
  const kinds = Object.fromEntries(
    corpus.documents.reduce(
      (counts, document) => counts.set(document.kind, (counts.get(document.kind) ?? 0) + 1),
      new Map<ReferenceKind, number>(),
    ),
  )
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

export function referenceUnits(
  corpus: ReferenceCorpus,
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  faction: string,
  battleSize?: number,
  detachment?: string,
) {
  const wanted = faction.trim().toLocaleLowerCase()
  const foundFaction = referenceFactions(corpus).find((candidate) =>
    [candidate.id, candidate.slug, candidate.name].some((value) => value.toLocaleLowerCase() === wanted),
  )
  if (!foundFaction) return null
  const book = loaded.factions.find((entry) => entry.id === foundFaction.id)
  const displayName = book ? factionDisplayName(book.name, rules?.factionNames) : foundFaction.name
  const restrictions = rules?.factionRestrictions.get(routeSlug(displayName))
  const canonicalById = new Map(corpus.catalogue.datasheets.map((sheet) => [sheet.id, sheet]))
  const units = unitsIn(loaded, foundFaction.id, '', { restrictions, battleSize }).map((unit) =>
    unitReference(unit, canonicalById.get(unit.id)),
  )
  const selectedDetachment = detachment
    ? corpus.catalogue.detachments.find(
        (candidate) =>
          candidate.catalogueId === foundFaction.id &&
          [candidate.id, candidate.slug, candidate.name].some((value) => value.toLocaleLowerCase() === detachment.toLocaleLowerCase()),
      )
    : null
  if (detachment && !selectedDetachment) return null
  return {
    faction: foundFaction,
    battleSize: battleSize ?? null,
    detachment: selectedDetachment,
    units,
    revisions: corpus.catalogue.revisions,
  }
}

function unitReference(unit: UnitSummary, sheet: CanonicalDatasheet | undefined) {
  const route = sheet?.referenceRoute ?? (sheet ? { catalogueId: sheet.catalogueId, slug: sheet.slug } : null)
  return {
    ...unit,
    keywords: sheet?.keywords ?? [],
    composition: sheet?.composition ?? [],
    costs: sheet?.costs ?? [],
    canLead: sheet?.attachments.filter((relationship) => relationship.kind === 'leader').map((relationship) => relationship.name) ?? [],
    canSupport: sheet?.attachments.filter((relationship) => relationship.kind === 'support').map((relationship) => relationship.name) ?? [],
    canBeLedBy: sheet?.leaders.map((relationship) => relationship.name) ?? [],
    canBeSupportedBy: sheet?.supporters.map((relationship) => relationship.name) ?? [],
    url: route ? `/factions/${route.catalogueId}/datasheets/${route.slug}` : null,
    referenceId: route ? `datasheet:${route.catalogueId}:${route.slug}` : null,
  }
}

export function referenceRecord(corpus: ReferenceCorpus, rules: LoadedRules | null, id: string) {
  const document = corpus.byId.get(id)
  if (!document) return null
  const references = rules ? gameReferencesFor(rules) : null
  let data: unknown = document
  if (id.startsWith('datasheet:')) {
    const [, catalogueId, slug] = id.split(':')
    data = corpus.catalogue.datasheets.find(
      (sheet) => sheet.slug === slug && (sheet.catalogueId === catalogueId || sheet.referenceRoute?.catalogueId === catalogueId),
    )
  } else if (id.startsWith('detachment:')) {
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
  } else if (id.startsWith('deployment:') && rules) {
    data = rules.deployments.find((candidate) => candidate.id === id.slice('deployment:'.length))
  } else if (id.startsWith('terrain:') && rules) {
    data = rules.terrainLayouts.find((candidate) => candidate.id === id.slice('terrain:'.length))
  }
  return data ? { document, data } : null
}

const cardSummary = (card: GameReferences['secondaries'][number]) => ({ id: card.key, name: card.name })
type GameReferences = ReturnType<typeof gameReferencesFor>

function missionSetups(corpus: ReferenceCorpus, rules: LoadedRules | null, matchups: GameReferencePack['missions'][number]['matchups']) {
  if (!rules) return []
  const deployments = new Map(rules.deployments.map((deployment) => [deployment.id, deployment]))
  return matchups.flatMap(([you, opponent]) => {
    if (!you || !opponent) return []
    const matchupIds = new Set([`${you.id}-vs-${opponent.id}`, `${opponent.id}-vs-${you.id}`])
    const terrain = rules.terrainLayouts
      .filter((layout) => matchupIds.has(layout.matchupId))
      .map((layout) => ({
        id: layout.id,
        name: layout.name,
        variant: layout.variant,
        deploymentId: layout.deploymentId,
        referenceId: `terrain:${layout.id}`,
        url: corpus.byId.get(`terrain:${layout.id}`)?.url ?? null,
      }))
    const deploymentIds = new Set(terrain.flatMap((layout) => (layout.deploymentId ? [layout.deploymentId] : [])))
    return [
      {
        you,
        opponent,
        terrain,
        deployments: [...deploymentIds].map((deploymentId) => ({
          id: deploymentId,
          name: deployments.get(deploymentId)?.name ?? deploymentId,
          referenceId: `deployment:${deploymentId}`,
          url: corpus.byId.get(`deployment:${deploymentId}`)?.url ?? null,
        })),
      },
    ]
  })
}

type GameReferencePack = GameReferences['packs'][number]
