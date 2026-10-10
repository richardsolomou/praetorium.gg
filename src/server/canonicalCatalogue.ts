import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { structureDatasheetProfiles } from '../core/datasheetStructure'
import { compareText } from '../core/text'
import type {
  CanonicalCatalogue,
  CanonicalCatalogueIssue,
  CanonicalDatasheet,
  CanonicalDetachment,
  CanonicalFieldResolution,
  CanonicalSourceName,
} from '../contracts/catalogue'
import type { RuleDocument } from '../contracts/rules'
import { datasheetIn } from '../shared/catalogue'
import { catalogueDirectory, datasheetsOf, isReferenceDatasheet, loadCatalogue, type LoadedCatalogue } from './catalogueIndex'
import { isMatchedPlayDatasheet } from '../shared/cataloguePicker'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { datacardOf } from '../shared/datasheetJoin'
import { describeDatasheetAbilitiesWithContributions } from '../shared/datasheetDescriptions'
import { detachmentReference } from '../shared/detachmentReference'
import { factionsFor } from '../shared/factionReferences'
import { factionDisplayName } from '../shared/factionNames'
import { loadRules, type LoadedRules } from './rules'
import { mfmAttribution, mfmCostRows } from './mfm'
import { mfmUnitFor } from '../shared/unitPoints'

export const CANONICAL_CATALOGUE_FORMAT = 'praetorium.canonical-catalogue.v1' as const
export const CANONICAL_CATALOGUE_COMPILER_VERSION = 3 as const

const characteristicSchema = z.object({
  name: z.string(),
  value: z.string(),
  baseValue: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  kind: z.enum([
    'movement',
    'toughness',
    'save',
    'wounds',
    'leadership',
    'objective-control',
    'invulnerable-save',
    'range',
    'attacks',
    'ballistic-skill',
    'weapon-skill',
    'strength',
    'armour-penetration',
    'damage',
    'keywords',
    'other',
  ]),
})

const relationshipSchema = z.object({
  kind: z.enum(['leader', 'support']).optional(),
  name: z.string(),
  entryId: z.string().nullable(),
  route: z.object({ catalogueId: z.string(), slug: z.string() }).nullable(),
})

const sourceNameSchema = z.enum(['definitions', 'points', 'rules', 'datacards', 'battlemaster'])
const fieldResolutionSchema = z.object({
  sources: z.array(sourceNameSchema),
  strategy: z.enum(['single-source', 'sources-agree', 'merged', 'source-priority', 'fallback', 'unresolved']),
})

const canonicalDatasheetSchema = z.object({
  catalogueId: z.string(),
  faction: z.string(),
  attribution: z.string().nullable(),
  id: z.string(),
  slug: z.string(),
  referenceRoute: z.object({ catalogueId: z.string(), slug: z.string() }).nullable(),
  name: z.string(),
  points: z.number().nullable(),
  keywords: z.array(z.string()),
  profiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      count: z.number().optional(),
      kind: z.enum(['unit', 'ranged-weapon', 'melee-weapon', 'transport', 'rule', 'other']),
      values: z.array(characteristicSchema),
    }),
  ),
  abilities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      source: z.string().optional(),
      description: z.string().nullable(),
      kind: z.enum(['core', 'faction', 'datasheet', 'rule', 'upgrade', 'wargear']),
    }),
  ),
  composition: z.array(z.string()),
  loadout: z.string().nullable(),
  wargearOptions: z.array(z.string()),
  wargearGroups: z.array(z.object({ instruction: z.string(), options: z.array(z.string()) })).optional(),
  baseSize: z.string().nullable(),
  transport: z.string().nullable(),
  costs: z.array(
    z.object({
      models: z.string(),
      cost: z.string(),
      keyword: z.string().nullable(),
      faction: z.string().nullable(),
      detachment: z.string().nullable(),
      copies: z.string().optional(),
    }),
  ),
  attachments: z.array(relationshipSchema),
  leaders: z.array(relationshipSchema),
  supporters: z.array(relationshipSchema),
  keywordRules: z.array(z.object({ name: z.string(), description: z.string() })),
  provenance: z.object({
    definitions: z.object({ revision: z.string(), entryId: z.string() }),
    datacards: z.object({ revision: z.string(), resolution: z.enum(['external-reference', 'normalized-name']) }).nullable(),
    rules: z.object({ revision: z.string(), unitId: z.string(), resolution: z.literal('external-reference') }).nullable(),
    fields: z.object({
      identity: fieldResolutionSchema,
      points: fieldResolutionSchema,
      keywords: fieldResolutionSchema,
      profiles: fieldResolutionSchema,
      abilities: fieldResolutionSchema,
      composition: fieldResolutionSchema,
      loadout: fieldResolutionSchema,
      wargear: fieldResolutionSchema,
      baseSize: fieldResolutionSchema,
      transport: fieldResolutionSchema,
      costs: fieldResolutionSchema,
      relationships: fieldResolutionSchema,
    }),
  }),
})

const canonicalDetachmentSchema = z.object({
  catalogueId: z.string(),
  faction: z.string(),
  factionSlug: z.string(),
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  points: z.number().nullable(),
  dispositions: z.array(z.string()),
  rules: z.array(z.object({ name: z.string(), description: z.string().nullable() })),
  enhancements: z.array(z.object({ name: z.string(), points: z.number().nullable(), description: z.string().nullable() })),
  upgrades: z.array(z.object({ name: z.string(), points: z.number().nullable(), description: z.string().nullable() })),
  stratagems: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      cp: z.number(),
      type: z.string().nullable(),
      phases: z.array(z.string()),
      turn: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  keywordRules: z.array(z.object({ name: z.string(), description: z.string() })),
  attribution: z.string(),
  provenance: z.object({
    definitions: z.object({ revision: z.string(), detachmentId: z.string() }),
    datacards: z.object({ revision: z.string() }),
  }),
})

const issueSchema = z.object({
  kind: z.enum([
    'missing-source-record',
    'source-name-fallback',
    'source-field-conflict',
    'source-field-fallback',
    'unclassified-profile',
    'unclassified-characteristic',
  ]),
  severity: z.enum(['notice', 'warning']),
  catalogueId: z.string(),
  entryId: z.string(),
  path: z.string(),
  message: z.string(),
})

const ruleBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prose'), markup: z.string() }),
  z.object({ kind: z.literal('heading'), text: z.string() }),
  z.object({
    kind: z.literal('clarification'),
    code: z.string().nullable(),
    anchor: z.string().nullable(),
    title: z.string(),
    markup: z.string(),
  }),
])

const ruleDocumentSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  updated: z.string().nullable(),
  sections: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      entries: z.array(
        z.object({
          id: z.string(),
          code: z.string().nullable(),
          anchor: z.string(),
          title: z.string(),
          blocks: z.array(ruleBlockSchema),
          facts: z.array(z.object({ label: z.string(), markup: z.string() })),
          cost: z.number().nullable(),
          lore: z.string().nullable(),
        }),
      ),
    }),
  ),
  provenance: z.object({ datacards: z.object({ revision: z.string() }) }),
})

export const canonicalCatalogueSchema = z.object({
  format: z.literal(CANONICAL_CATALOGUE_FORMAT),
  compilerVersion: z.union([z.literal(1), z.literal(CANONICAL_CATALOGUE_COMPILER_VERSION)]),
  revisions: z.record(z.string(), z.string()),
  datasheets: z.array(canonicalDatasheetSchema),
  detachments: z.array(canonicalDetachmentSchema).default([]),
  ruleDocuments: z.array(ruleDocumentSchema),
  issues: z.array(issueSchema),
})

export function compileCanonicalDetachments(
  loaded: LoadedCatalogue,
  revisions: Record<string, string>,
  rules: LoadedRules | null,
): CanonicalDetachment[] {
  if (!rules) return []
  return factionsFor(loaded, rules)
    .factions.flatMap((faction) =>
      faction.detachments.flatMap((detachment) => {
        if (!faction.referenceDetachmentIds.includes(detachment.id)) return []
        const detail = detachmentReference(loaded, rules, faction.id, detachment.slug)
        if (!detail) return []
        return [
          {
            ...detail,
            catalogueId: faction.id,
            faction: faction.displayName,
            factionSlug: faction.slug,
            id: detachment.id,
            slug: detachment.slug,
            provenance: {
              definitions: { revision: revisions.definitions ?? loaded.index.revision, detachmentId: detachment.id },
              datacards: { revision: revisions.datacards ?? 'unknown' },
            },
          },
        ]
      }),
    )
    .toSorted((left, right) => compareText(left.faction, right.faction) || compareText(left.name, right.name))
}

const resolution = (sources: readonly CanonicalSourceName[], strategy: CanonicalFieldResolution['strategy']): CanonicalFieldResolution => ({
  sources: [...sources],
  strategy,
})

const sourceOrUnresolved = (source: CanonicalSourceName | null, fallback = false) =>
  source ? resolution([source], fallback ? 'fallback' : 'single-source') : resolution([], 'unresolved')

const uniqueSources = (sources: readonly CanonicalSourceName[]) => [...new Set(sources)]

function singleUnqualifiedPoint(costs: readonly CanonicalDatasheet['costs'][number][]) {
  const unqualified = costs.filter((cost) => !cost.keyword && !cost.faction && !cost.detachment && !cost.copies)
  if (unqualified.length !== 1 || !/^\d+$/.test(unqualified[0]!.cost)) return null
  return Number(unqualified[0]!.cost)
}

function issuesFor(
  sheet: CanonicalDatasheet,
  joined: ReturnType<typeof datacardOf>,
  definitionsPoints: number | null,
): CanonicalCatalogueIssue[] {
  const issues: CanonicalCatalogueIssue[] = []
  if (!joined) {
    issues.push({
      kind: 'missing-source-record',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/provenance/datacards',
      message: `${sheet.name} has no matching Game Datacards record`,
    })
  } else if (joined.method === 'name') {
    issues.push({
      kind: 'source-name-fallback',
      severity: 'notice',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/provenance/datacards',
      message: `${sheet.name} joins Game Datacards by normalized name`,
    })
  }
  if (sheet.points !== null && definitionsPoints !== null && sheet.points !== definitionsPoints) {
    issues.push({
      kind: 'source-field-conflict',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/points',
      message: `${sheet.name} uses Game Datacards ${sheet.points} points for reference display over BSData ${definitionsPoints}`,
    })
  }
  for (const [profileIndex, profile] of sheet.profiles.entries()) {
    if (profile.kind === 'other') {
      issues.push({
        kind: 'unclassified-profile',
        severity: 'warning',
        catalogueId: sheet.catalogueId,
        entryId: sheet.id,
        path: `/profiles/${profileIndex}`,
        message: `${sheet.name} has an unclassified profile type named ${profile.type}`,
      })
    }
    if (!['unit', 'ranged-weapon', 'melee-weapon'].includes(profile.kind)) continue
    for (const [valueIndex, value] of profile.values.entries()) {
      if (value.kind !== 'other') continue
      issues.push({
        kind: 'unclassified-characteristic',
        severity: 'warning',
        catalogueId: sheet.catalogueId,
        entryId: sheet.id,
        path: `/profiles/${profileIndex}/values/${valueIndex}`,
        message: `${sheet.name} has an unclassified ${profile.type} characteristic named ${value.name}`,
      })
    }
  }
  return issues
}

export function compileCanonicalCatalogue(
  loaded: LoadedCatalogue,
  revisions: Record<string, string>,
  rules: LoadedRules | null = null,
): CanonicalCatalogue {
  const datasheets: CanonicalDatasheet[] = []
  const issues: CanonicalCatalogueIssue[] = []
  for (const faction of loaded.factions) {
    for (const entryId of datasheetsOf(loaded.index, faction.id)) {
      const entry = loaded.index.definitions.get(entryId)
      if (!entry || !isMatchedPlayDatasheet(loaded.index, entry) || !isReferenceDatasheet(loaded, faction.id, entryId)) continue
      const projected = datasheetIn(loaded, faction.id, entryId)
      if (!projected) continue
      const joined = datacardOf(loaded, faction.id, entryId)
      const description = describeDatasheetAbilitiesWithContributions(loaded, faction.id, projected, rules, { reference: true })
      if (!description) continue
      const { datasheet: described, contributions: abilityContributions } = description
      const cardsBaseSize = described.baseSize
      const cardsComposition = described.composition
      const cardsCosts = described.costs
      const mfmUnit = mfmUnitFor(loaded, faction.id, entryId)
      const sourceCosts = mfmUnit ? mfmCostRows(mfmUnit) : cardsCosts
      const costSource: CanonicalSourceName = mfmUnit ? 'points' : 'datacards'
      const costPoint = singleUnqualifiedPoint(sourceCosts)
      const points = sourceCosts.length ? costPoint : described.points
      const usesDatacards = Boolean(
        cardsBaseSize ||
        cardsComposition.length ||
        cardsCosts.length ||
        described.loadout ||
        described.transport ||
        joined?.details.wargear.length ||
        joined?.details.wargearGroups?.length ||
        abilityContributions.datacards,
      )
      const attribution =
        [usesDatacards || abilityContributions.rules ? DATACARDS_ATTRIBUTION : null, mfmUnit ? mfmAttribution(loaded.mfm) : null]
          .filter(Boolean)
          .join('. ') || null
      const abilitySources = uniqueSources([
        'definitions',
        ...(abilityContributions.datacards || abilityContributions.rules ? (['datacards'] as const) : []),
      ])
      const costsResolution = sourceOrUnresolved(sourceCosts.length ? costSource : null)
      const pointSources = uniqueSources([
        ...(described.points === null ? [] : (['definitions'] as const)),
        ...(sourceCosts.length ? ([costSource] as const) : []),
      ])
      const pointsResolution = !sourceCosts.length
        ? sourceOrUnresolved(described.points === null ? null : 'definitions')
        : costPoint === null
          ? resolution(pointSources, 'unresolved')
          : described.points === null
            ? sourceOrUnresolved(costSource)
            : resolution(pointSources, described.points === costPoint ? 'sources-agree' : 'source-priority')
      const sheet: CanonicalDatasheet = {
        ...described,
        catalogueId: faction.id,
        faction: factionDisplayName(faction.name, rules?.factionNames),
        attribution: attribution || null,
        points,
        profiles: structureDatasheetProfiles(described.profiles),
        baseSize: cardsBaseSize,
        composition: cardsComposition,
        costs: sourceCosts,
        provenance: {
          definitions: { revision: revisions.definitions ?? loaded.index.revision, entryId },
          datacards: joined
            ? {
                revision: revisions.datacards ?? 'unknown',
                resolution: 'normalized-name',
              }
            : null,
          rules: null,
          fields: {
            identity: sourceOrUnresolved('definitions'),
            points: pointsResolution,
            keywords: sourceOrUnresolved('definitions'),
            profiles: sourceOrUnresolved('definitions'),
            abilities: resolution(abilitySources, abilitySources.length > 1 ? 'merged' : 'single-source'),
            composition: sourceOrUnresolved(cardsComposition.length ? 'datacards' : null),
            loadout: sourceOrUnresolved(joined && described.loadout ? 'datacards' : null),
            wargear: sourceOrUnresolved(joined?.details.wargear.length ? 'datacards' : 'definitions', !joined?.details.wargear.length),
            baseSize: sourceOrUnresolved(cardsBaseSize ? 'datacards' : null),
            transport: sourceOrUnresolved(joined && described.transport ? 'datacards' : null),
            costs: costsResolution,
            relationships: sourceOrUnresolved('definitions'),
          },
        },
      }
      datasheets.push(sheet)
      issues.push(...issuesFor(sheet, joined, described.points))
    }
  }
  const canonicalRoutes = new Set(
    datasheets.flatMap((sheet) => (sheet.referenceRoute ? [`${sheet.referenceRoute.catalogueId}\0${sheet.referenceRoute.slug}`] : [])),
  )
  const keepCanonicalRoutes = (relationships: CanonicalDatasheet['attachments']) =>
    relationships.map((relationship) =>
      relationship.route && !canonicalRoutes.has(`${relationship.route.catalogueId}\0${relationship.route.slug}`)
        ? { ...relationship, route: null }
        : relationship,
    )
  const routedDatasheets = datasheets.map((sheet) => ({
    ...sheet,
    attachments: keepCanonicalRoutes(sheet.attachments),
    leaders: keepCanonicalRoutes(sheet.leaders),
    supporters: keepCanonicalRoutes(sheet.supporters),
  }))
  return canonicalCatalogueSchema.parse({
    format: CANONICAL_CATALOGUE_FORMAT,
    compilerVersion: CANONICAL_CATALOGUE_COMPILER_VERSION,
    revisions: Object.fromEntries(Object.entries(revisions).toSorted(([left], [right]) => compareText(left, right))),
    datasheets: routedDatasheets.toSorted(
      (left, right) => compareText(left.faction, right.faction) || compareText(left.name, right.name) || compareText(left.id, right.id),
    ),
    detachments: compileCanonicalDetachments(loaded, revisions, rules),
    ruleDocuments: compileCanonicalRuleDocuments(rules?.ruleDocuments ?? [], revisions.datacards ?? 'unknown'),
    issues: issues.toSorted(
      (left, right) =>
        compareText(left.catalogueId, right.catalogueId) || compareText(left.entryId, right.entryId) || compareText(left.path, right.path),
    ),
  })
}

export function compileCanonicalRuleDocuments(documents: readonly RuleDocument[], revision: string) {
  return documents
    .map((document) => ({ ...document, provenance: { datacards: { revision } } }))
    .toSorted((left, right) => compareText(left.title, right.title) || compareText(left.id, right.id))
}

export function canonicalCataloguePath(directory: string) {
  return path.join(directory, 'canonical', 'catalogue.json')
}

/** The rules a snapshot directory carries, read beside the catalogue already loaded from it. */
export const snapshotRules = (directory: string, loaded: LoadedCatalogue) =>
  loadRules(
    directory,
    path.join(directory, 'battlemaster'),
    path.join(directory, 'faction-icons'),
    path.join(directory, 'datacards', '11th', 'gdc'),
    loaded.datacards,
  )

/**
 * A snapshot's reference catalogue: the compiled one it packages, or one compiled from its
 * sources, which is how a running instance reads the snapshot it serves.
 */
export function referenceCatalogue(directory: string, catalogue: () => LoadedCatalogue | null, rules: () => LoadedRules | null) {
  if (process.env.PRAETORIUM_LOCAL_DEV === 'true' && process.env.LOCAL_TEST_MODE !== 'true') {
    const local = process.env.LOCAL_CANONICAL_FILE ?? path.resolve('.output/canonical-catalogue.json')
    const candidate = currentCanonicalCatalogue(local)
    const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')) as Record<string, string>
    if (candidate && Object.entries(revisions).every(([source, revision]) => candidate.revisions[source] === revision)) return candidate
  }
  const packaged = loadCanonicalCatalogue(directory)
  if (packaged && !packaged.revisions.rules) return packaged
  const loaded = catalogue()
  return loaded ? compileCanonicalCatalogueFromSnapshot(loaded, rules(), directory) : null
}

export function writeCanonicalCatalogue(directory: string, output = canonicalCataloguePath(directory)) {
  const loaded = loadCatalogue(directory)
  if (!loaded) throw new Error('catalogue data is unavailable')
  const catalogue = compileCanonicalCatalogueFromSnapshot(loaded, snapshotRules(directory, loaded), directory)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(catalogue, null, 2)}\n`)
  return catalogue
}

export function compileCanonicalCatalogueFromSnapshot(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  directory = catalogueDirectory(),
) {
  const revisionFile = path.join(directory, 'revision.json')
  const revisions = JSON.parse(fs.readFileSync(revisionFile, 'utf8')) as Record<string, string>
  delete revisions.rules
  return compileCanonicalCatalogue(loaded, revisions, rules)
}

export function readCanonicalCatalogue(file: string): CanonicalCatalogue {
  return canonicalCatalogueSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
}

export const loadCanonicalCatalogue = (directory = catalogueDirectory()) => currentCanonicalCatalogue(canonicalCataloguePath(directory))

/** Null for an artifact of another format or compiler, which older schemas may not parse; its snapshot is recompiled instead. */
function currentCanonicalCatalogue(file: string): CanonicalCatalogue | null {
  if (!fs.existsSync(file)) return null
  const candidate: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (
    candidate &&
    typeof candidate === 'object' &&
    (('format' in candidate && candidate.format !== CANONICAL_CATALOGUE_FORMAT) ||
      ('compilerVersion' in candidate && candidate.compilerVersion !== CANONICAL_CATALOGUE_COMPILER_VERSION))
  ) {
    return null
  }
  return canonicalCatalogueSchema.parse(candidate)
}
