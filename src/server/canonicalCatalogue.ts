import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { targetOf } from '../core/catalogue'
import { structureDatasheetProfiles } from '../core/datasheetStructure'
import { compareText, sameText } from '../core/text'
import type {
  CanonicalCatalogue,
  CanonicalCatalogueIssue,
  CanonicalDatasheet,
  CanonicalDetachment,
  CanonicalFieldResolution,
  CanonicalSourceName,
} from '../contracts/catalogue'
import type { RuleDocument } from '../contracts/rules'
import { datasheetIn } from './catalogue'
import { catalogueDirectory, datasheetsOf, isReferenceDatasheet, loadCatalogue, type LoadedCatalogue } from './catalogueIndex'
import { isMatchedPlayDatasheet } from './cataloguePicker'
import {
  loadSourceUnits,
  sourceBaseSize,
  sourceComposition,
  sourceCosts,
  sourceUnitOf,
  type SourceUnit,
  type SourceUnitJoin,
} from './catalogueSourceUnits'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { datacardOf } from './datasheetJoin'
import { describeDatasheetAbilitiesWithContributions } from './datasheetDescriptions'
import { detachmentReference } from './detachmentReference'
import { factionsFor } from './factionReferences'
import { factionDisplayName } from './factionNames'
import { loadRules, type LoadedRules, RULES_DATA_ATTRIBUTION } from './rules'
import { joinKey } from './rulesSource'

export const CANONICAL_CATALOGUE_FORMAT = 'praetorium.canonical-catalogue.v1' as const

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
    rules: z.object({ revision: z.string() }),
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
  compilerVersion: z.literal(1),
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
              rules: { revision: revisions.rules ?? 'unknown' },
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
  const unqualified = costs.filter((cost) => !cost.keyword && !cost.faction && !cost.detachment)
  if (unqualified.length !== 1 || !/^\d+$/.test(unqualified[0]!.cost)) return null
  return Number(unqualified[0]!.cost)
}

type ModelCountRange = { minimum: number; maximum: number }

function declaredCompositionRange(composition: readonly string[]): ModelCountRange | null {
  const alternatives: ModelCountRange[][] = [[]]
  for (const line of composition) {
    if (line.trim().toLowerCase() === 'or') {
      alternatives.push([])
      continue
    }
    if (!/^\*{0,2}\s*\d/.test(line.trim())) return null
    const counts = [...line.matchAll(/(?<![\p{L}\p{N}])(\d+)(?:\s*\p{Pd}\s*(\d+))?(?![\p{L}\p{N}])/gu)]
    if (!counts.length) return null
    alternatives.at(-1)!.push(...counts.map((count) => ({ minimum: Number(count[1]), maximum: Number(count[2] ?? count[1]) })))
  }
  const totals = alternatives.flatMap((groups) =>
    groups.length
      ? [
          {
            minimum: groups.reduce((total, group) => total + group.minimum, 0),
            maximum: groups.reduce((total, group) => total + group.maximum, 0),
          },
        ]
      : [],
  )
  return totals.length
    ? {
        minimum: Math.min(...totals.map((total) => total.minimum)),
        maximum: Math.max(...totals.map((total) => total.maximum)),
      }
    : null
}

const sameModelCount = (left: ModelCountRange, right: ModelCountRange) => left.minimum === right.minimum && left.maximum === right.maximum

const modelCountLabel = ({ minimum, maximum }: ModelCountRange) => (minimum === maximum ? String(minimum) : `${minimum}-${maximum}`)

const comparableBaseSize = (value: string) => {
  const trimmed = value.trim()
  if (
    !/^(?:\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?mm(?:\s+oval\s+base)?|hull|unique|small flying base|large flying base)$/i.test(trimmed)
  ) {
    return null
  }
  return trimmed
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .replace(/ovalbase$/, 'oval')
}

function sharedCostConflicts(cards: readonly CanonicalDatasheet['costs'][number][], rules: readonly CanonicalDatasheet['costs'][number][]) {
  const cardCosts = new Map(
    cards.filter((cost) => !cost.keyword && !cost.faction && !cost.detachment).map((cost) => [cost.models, cost.cost]),
  )
  return rules.filter((cost) => cardCosts.has(cost.models) && cardCosts.get(cost.models) !== cost.cost)
}

type SourceEvidence = {
  definitionsPoints: number | null
  cardsBaseSize: string | null
  rulesBaseSize: string | null
  cardsComposition: readonly string[]
  rulesComposition: readonly string[]
  cardsModelCount: ModelCountRange | null
  rulesModelCount: ModelCountRange | null
  cardsCosts: readonly CanonicalDatasheet['costs'][number][]
  rulesCosts: readonly CanonicalDatasheet['costs'][number][]
}

const sourceStatKeys = {
  movement: 'M',
  toughness: 'T',
  save: 'Sv',
  wounds: 'W',
  leadership: 'Ld',
  'objective-control': 'OC',
  'invulnerable-save': 'invuln_sv',
} as const

function sourceStat(kind: keyof typeof sourceStatKeys, raw: string | number) {
  const value = String(raw).trim()
  if (kind === 'movement') return /["″”]$/.test(value) ? value : `${value}"`
  if (kind === 'save' || kind === 'leadership' || kind === 'invulnerable-save') return value.endsWith('+') ? value : `${value}+`
  return value
}

const comparableStat = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[″”]/g, '"')
    .replaceAll('*', '')
    .replaceAll(/\s+/g, '')

function issuesFor(
  sheet: CanonicalDatasheet,
  joined: ReturnType<typeof datacardOf>,
  sourceJoin: SourceUnitJoin | null,
  evidence: SourceEvidence,
): CanonicalCatalogueIssue[] {
  const issues: CanonicalCatalogueIssue[] = []
  const {
    definitionsPoints,
    cardsBaseSize,
    rulesBaseSize,
    cardsComposition,
    rulesComposition,
    cardsModelCount,
    rulesModelCount,
    cardsCosts,
    rulesCosts,
  } = evidence
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
      message: `${sheet.name} joins Game Datacards by normalized name rather than an external reference`,
    })
  }
  if (!sourceJoin) {
    issues.push({
      kind: 'missing-source-record',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/provenance/rules',
      message: `${sheet.name} has no unambiguous 40kdc record linked by an external reference`,
    })
  } else if (!sameText(sourceJoin.unit.name, sheet.name)) {
    issues.push({
      kind: 'source-field-conflict',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/name',
      message: `${sheet.name} keeps the BSData name ${JSON.stringify(sheet.name)} over 40kdc ${JSON.stringify(sourceJoin.unit.name)}`,
    })
  }
  if (!cardsBaseSize && rulesBaseSize) {
    issues.push({
      kind: 'source-field-fallback',
      severity: 'notice',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/baseSize',
      message: `${sheet.name} uses 40kdc for base size because Game Datacards has no value`,
    })
  }
  if (!cardsComposition.length && rulesComposition.length) {
    issues.push({
      kind: 'source-field-fallback',
      severity: 'notice',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/composition',
      message: `${sheet.name} uses 40kdc model counts because Game Datacards has no composition`,
    })
  }
  if (cardsModelCount && rulesModelCount && !sameModelCount(cardsModelCount, rulesModelCount)) {
    issues.push({
      kind: 'source-field-conflict',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/composition',
      message: `${sheet.name} keeps Game Datacards composition ${modelCountLabel(cardsModelCount)} over 40kdc ${modelCountLabel(rulesModelCount)}`,
    })
  }
  const cardsBaseKey = cardsBaseSize ? comparableBaseSize(cardsBaseSize) : null
  const rulesBaseKey = rulesBaseSize ? comparableBaseSize(rulesBaseSize) : null
  if (cardsBaseKey && rulesBaseKey && cardsBaseKey !== rulesBaseKey) {
    issues.push({
      kind: 'source-field-conflict',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/baseSize',
      message: `${sheet.name} keeps Game Datacards base size ${JSON.stringify(cardsBaseSize)} over 40kdc ${JSON.stringify(rulesBaseSize)}`,
    })
  }
  if (!cardsCosts.length && rulesCosts.length) {
    issues.push({
      kind: 'source-field-fallback',
      severity: 'notice',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/costs',
      message: `${sheet.name} uses unambiguous 40kdc points because Game Datacards has no values`,
    })
  }
  const conflictingCosts = sharedCostConflicts(cardsCosts, rulesCosts)
  if (conflictingCosts.length) {
    issues.push({
      kind: 'source-field-conflict',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/costs',
      message: `${sheet.name} keeps Game Datacards points where 40kdc disagrees for ${conflictingCosts.map((cost) => `${cost.models} models`).join(', ')}`,
    })
  }
  if (sheet.points !== null && definitionsPoints !== null && sheet.points !== definitionsPoints) {
    issues.push({
      kind: 'source-field-conflict',
      severity: 'warning',
      catalogueId: sheet.catalogueId,
      entryId: sheet.id,
      path: '/points',
      message: `${sheet.name} uses ${cardsCosts.length ? 'Game Datacards' : '40kdc'} ${sheet.points} points for reference display over BSData ${definitionsPoints}`,
    })
  }
  const sheetUnitProfiles = sheet.profiles.filter((profile) => profile.kind === 'unit')
  for (const [profileIndex, profile] of sheet.profiles.entries()) {
    if (profile.kind !== 'unit' || !sourceJoin) continue
    const named = sourceJoin.unit.profiles.find((candidate) => joinKey(candidate.name) === joinKey(profile.name))
    const sourceProfile =
      named ?? (sheetUnitProfiles.length === 1 && sourceJoin.unit.profiles.length === 1 ? sourceJoin.unit.profiles[0] : null)
    if (!sourceProfile) continue
    for (const [valueIndex, value] of profile.values.entries()) {
      if (!(value.kind in sourceStatKeys)) continue
      const kind = value.kind as keyof typeof sourceStatKeys
      const raw = sourceProfile.values[sourceStatKeys[kind]]
      if (raw === undefined) continue
      const candidate = sourceStat(kind, raw)
      if (comparableStat(candidate) === comparableStat(value.value)) continue
      issues.push({
        kind: 'source-field-conflict',
        severity: 'warning',
        catalogueId: sheet.catalogueId,
        entryId: sheet.id,
        path: `/profiles/${profileIndex}/values/${valueIndex}`,
        message: `${sheet.name} keeps BSData ${value.name} ${JSON.stringify(value.value)} over 40kdc ${JSON.stringify(candidate)}`,
      })
    }
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
  sourceUnits: ReadonlyMap<string, readonly SourceUnit[]> = new Map(),
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
      const sourceJoin = sourceUnitOf(sourceUnits, targetOf(entry, loaded.index.definitions).id)
      const description = describeDatasheetAbilitiesWithContributions(loaded, faction.id, projected, rules, { reference: true })
      if (!description) continue
      const { datasheet: described, contributions: abilityContributions } = description
      const cardsBaseSize = described.baseSize
      const rulesBaseSize = sourceBaseSize(sourceJoin?.unit.baseSize ?? null)
      const cardsComposition = described.composition
      const rulesComposition = sourceComposition(sourceJoin?.unit.modelCount ?? null)
      const cardsModelCount = declaredCompositionRange(cardsComposition)
      const rulesModelCount = sourceJoin?.unit.modelCount
        ? { minimum: sourceJoin.unit.modelCount.min, maximum: sourceJoin.unit.modelCount.max }
        : null
      const cardsCosts = described.costs
      const rulesCosts = sourceCosts(sourceJoin?.unit.points ?? [])
      const baseSize = cardsBaseSize ?? rulesBaseSize
      const composition = cardsComposition.length ? cardsComposition : rulesComposition
      const costs = cardsCosts.length ? cardsCosts : rulesCosts
      const costPoint = singleUnqualifiedPoint(costs)
      const points = costs.length ? costPoint : described.points
      const usesRulesDisplayData =
        (!cardsBaseSize && Boolean(rulesBaseSize)) ||
        (!cardsComposition.length && Boolean(rulesComposition.length)) ||
        (!cardsCosts.length && Boolean(rulesCosts.length))
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
      const attribution = [
        ...new Set([
          usesDatacards ? DATACARDS_ATTRIBUTION : null,
          usesRulesDisplayData || abilityContributions.rules ? RULES_DATA_ATTRIBUTION : null,
        ]),
      ]
        .filter((value): value is string => Boolean(value))
        .join('. ')
      const abilitySources = uniqueSources([
        'definitions',
        ...(abilityContributions.datacards ? (['datacards'] as const) : []),
        ...(abilityContributions.rules ? (['rules'] as const) : []),
      ])
      const costSources: CanonicalSourceName[] = [
        ...(cardsCosts.length ? (['datacards'] as const) : []),
        ...(rulesCosts.length ? (['rules'] as const) : []),
      ]
      const costsResolution = cardsCosts.length
        ? resolution(costSources, rulesCosts.length ? 'source-priority' : 'single-source')
        : sourceOrUnresolved(rulesCosts.length ? 'rules' : null, Boolean(rulesCosts.length))
      const pointSources = uniqueSources([...(described.points === null ? [] : (['definitions'] as const)), ...costSources])
      const pointsResolution = !costs.length
        ? sourceOrUnresolved(described.points === null ? null : 'definitions')
        : costPoint === null
          ? resolution(pointSources, 'unresolved')
          : described.points === null
            ? resolution(costSources, costsResolution.strategy === 'source-priority' ? 'source-priority' : 'fallback')
            : resolution(
                pointSources,
                described.points === costPoint && costsResolution.strategy !== 'source-priority' ? 'sources-agree' : 'source-priority',
              )
      const sheet: CanonicalDatasheet = {
        ...described,
        catalogueId: faction.id,
        faction: factionDisplayName(faction.name, rules?.factionNames),
        attribution: attribution || null,
        points,
        profiles: structureDatasheetProfiles(described.profiles),
        baseSize,
        composition,
        costs,
        provenance: {
          definitions: { revision: revisions.definitions ?? loaded.index.revision, entryId },
          datacards: joined
            ? {
                revision: revisions.datacards ?? 'unknown',
                resolution: joined.method === 'external-ref' ? 'external-reference' : 'normalized-name',
              }
            : null,
          rules: sourceJoin ? { revision: revisions.rules ?? 'unknown', unitId: sourceJoin.unit.id, resolution: sourceJoin.method } : null,
          fields: {
            identity: sourceJoin
              ? resolution(['definitions', 'rules'], sameText(sourceJoin.unit.name, described.name) ? 'sources-agree' : 'source-priority')
              : sourceOrUnresolved('definitions'),
            points: pointsResolution,
            keywords: sourceOrUnresolved('definitions'),
            profiles: sourceJoin?.unit.profiles.length
              ? resolution(['definitions', 'rules'], 'source-priority')
              : sourceOrUnresolved('definitions'),
            abilities: resolution(abilitySources, abilitySources.length > 1 ? 'merged' : 'single-source'),
            composition: cardsComposition.length
              ? sourceOrUnresolved('datacards')
              : sourceOrUnresolved(rulesComposition.length ? 'rules' : null, Boolean(rulesComposition.length)),
            loadout: sourceOrUnresolved(joined && described.loadout ? 'datacards' : null),
            wargear: sourceOrUnresolved(joined?.details.wargear.length ? 'datacards' : 'definitions', !joined?.details.wargear.length),
            baseSize: cardsBaseSize
              ? resolution(
                  rulesBaseSize ? ['datacards', 'rules'] : ['datacards'],
                  rulesBaseSize && comparableBaseSize(cardsBaseSize) === comparableBaseSize(rulesBaseSize)
                    ? 'sources-agree'
                    : rulesBaseSize
                      ? 'source-priority'
                      : 'single-source',
                )
              : sourceOrUnresolved(rulesBaseSize ? 'rules' : null, Boolean(rulesBaseSize)),
            transport: sourceOrUnresolved(joined && described.transport ? 'datacards' : null),
            costs: costsResolution,
            relationships: sourceOrUnresolved('definitions'),
          },
        },
      }
      datasheets.push(sheet)
      issues.push(
        ...issuesFor(sheet, joined, sourceJoin, {
          definitionsPoints: described.points,
          cardsBaseSize,
          rulesBaseSize,
          cardsComposition,
          rulesComposition,
          cardsModelCount,
          rulesModelCount,
          cardsCosts,
          rulesCosts,
        }),
      )
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
    compilerVersion: 1,
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

export function writeCanonicalCatalogue(directory: string, output = canonicalCataloguePath(directory)) {
  const loaded = loadCatalogue(directory)
  if (!loaded) throw new Error('catalogue data is unavailable')
  const rules = loadRules(
    path.join(directory, 'rules'),
    path.join(directory, 'battlemaster'),
    path.join(directory, 'faction-icons'),
    path.join(directory, 'datacards', '11th', 'gdc'),
    loaded.datacards,
    loaded.sourceReferences,
  )
  const catalogue = compileCanonicalCatalogueFromSnapshot(loaded, rules, directory)
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
  return compileCanonicalCatalogue(loaded, revisions, rules, loadSourceUnits(path.join(directory, 'rules', 'data', 'core')))
}

export function readCanonicalCatalogue(file: string): CanonicalCatalogue {
  return canonicalCatalogueSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
}

export function loadCanonicalCatalogue(directory = catalogueDirectory()): CanonicalCatalogue | null {
  const file = canonicalCataloguePath(directory)
  if (!fs.existsSync(file)) return null
  const candidate: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (
    candidate &&
    typeof candidate === 'object' &&
    'format' in candidate &&
    typeof candidate.format === 'string' &&
    candidate.format !== CANONICAL_CATALOGUE_FORMAT
  ) {
    return null
  }
  return canonicalCatalogueSchema.parse(candidate)
}
