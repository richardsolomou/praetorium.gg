import { summaryBlocks } from '../core/summaryMarkdown'
import { abilityKey } from '../shared/vsDataAbilities'
import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  vsDataAttributionSchema,
  vsDataMissionPackSchema,
  type VsDataDetachment,
  type VsDataStratagem,
  vsDataStratagemSchema,
  type VsDataSummariesFile,
  type VsDataUnit,
  vsDataEdition,
  vsDataKey,
  type VsDataRulesVersion,
  vsDataUnitSchema,
} from '../shared/vsData'

const fileSchema = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) })
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string(),
  rulesVersion: z.object({ edition: z.string(), update: z.string() }),
  identity: fileSchema,
  schemas: z.array(fileSchema),
  categories: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['complete', 'partial', 'retained']),
      sources: z.array(z.object({ revision: z.string().optional() })),
      records: z.array(fileSchema.extend({ kind: z.string(), id: z.string() })),
    }),
  ),
})
export type VsDataManifest = z.infer<typeof manifestSchema>

const refSchema = z.object({ kind: z.string().min(1), id: z.string().min(1) })
const identitySchema = z.object({
  entries: z.array(
    refSchema.extend({
      name: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      retired: z.unknown().optional(),
      absent: z.literal(true).optional(),
      references: z.array(refSchema).optional(),
    }),
  ),
})
const recordSchema = refSchema.extend({
  rulesVersion: z.object({ update: z.string() }),
  attribution: vsDataAttributionSchema.optional(),
  data: z.object({
    summary: z.string().min(1),
    summarySpans: z
      .array(z.object({ start: z.number().int(), end: z.number().int(), bold: z.literal(true).optional(), target: refSchema.optional() }))
      .optional(),
    interpretation: z.array(z.object({ question: z.string() })).optional(),
    ruleType: z.string().optional(),
    detachment: z.object({ id: z.string() }).optional(),
    cp: z.number().int().optional(),
    stratagem: z.unknown().optional(),
    facts: z.unknown().optional(),
  }),
})
const typedStratagemSchema = z.object({
  phases: z.array(z.string()),
  turn: z.string(),
  windows: z.unknown().optional(),
  type: z.string().optional(),
})
/** Only versioned facts are typed; the unversioned format is a draft reading. */
const factsSchema = z.object({
  format: z.literal('vs-data-facts'),
  fields: z.object({ stratagem: z.object({ limit: z.string().optional() }).optional() }),
})
const packRecordSchema = z.object({
  kind: z.literal('mission-pack'),
  rulesVersion: z.object({ update: z.string() }),
  data: vsDataMissionPackSchema,
})

/** A record with words of its own to show: not one VS Data holds back as `{ "unresolved": … }`, nor one, such as a mission card, complete without its own text. */
const hasSummary = (record: unknown) => typeof (record as { data?: { summary?: unknown } } | null)?.data?.summary === 'string'

const MANIFEST = 'manifest.json'
/** The categories whose records are rule summaries; others, such as datasheets, hold data Praetorium reads elsewhere. */
const SUMMARY_CATEGORIES = new Set(['rules-reference', 'mission-rules'])
const MISSION_PACKS = 'mission-packs'
const STRATAGEM_RULE_TYPES = new Set(['stratagem', 'core-stratagem'])
const IDENTITY = 'identity.json'

/** The release's manifest, or null where the folder holds no VS Data catalogue release. */
export function readVsDataManifest(directory: string): VsDataManifest | null {
  const file = path.join(directory, MANIFEST)
  if (!fs.existsSync(file)) return null
  const parsed = manifestSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')))
  return parsed.success ? parsed.data : null
}

/**
 * What is wrong with an unpacked VS Data catalogue release, as its own `verify` checks it: exactly the
 * files the manifest lists, each with its SHA-256, every record at the path its kind and ID give, and
 * categories and records in order. Like `verify`, it does not validate the records again.
 */
export function vsDataReleaseErrors(directory: string): string[] {
  const errors: string[] = []
  const present = new Set<string>()
  for (const entry of fs.readdirSync(directory, { withFileTypes: true, recursive: true })) {
    const file = path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
    if (entry.isFile()) present.add(file)
    else if (!entry.isDirectory()) errors.push(`${file}: not a regular file`)
  }
  if (!present.delete(MANIFEST)) return [...errors, `${MANIFEST}: missing`]
  const manifest = readVsDataManifest(directory)
  if (!manifest) return [...errors, `${MANIFEST}: not a VS Data catalogue release`]
  if (manifest.identity.path !== IDENTITY) errors.push(`/identity/path must be ${IDENTITY}`)
  const listed = [...manifest.schemas, manifest.identity]
  manifest.categories.forEach((category, at) => {
    if (at > 0 && manifest.categories[at - 1]!.name >= category.name) errors.push(`/categories/${at} is not in ascending name order`)
    if (category.status === 'retained') {
      if (category.records.length) errors.push(`/categories/${at} is retained but lists records`)
      category.sources.forEach((source, step) => {
        if (!source.revision) errors.push(`/categories/${at}/sources/${step} is missing the retained revision`)
      })
    }
    category.records.forEach((record, step) => {
      const expected = `records/${category.name}/${record.kind}/${record.id}.json`
      if (record.path !== expected) errors.push(`/categories/${at}/records/${step}/path must be ${expected}`)
      const previous = category.records[step - 1]
      if (previous && vsDataKey(previous) >= vsDataKey(record)) errors.push(`/categories/${at}/records/${step} is not in ascending order`)
      listed.push(record)
    })
  })
  for (const { path: file, sha256 } of listed) {
    if (!present.delete(file)) errors.push(`${file}: missing`)
    else if (hash('sha256', fs.readFileSync(path.join(directory, file))) !== sha256) errors.push(`${file}: checksum mismatch`)
  }
  errors.push(...[...present].map((file) => `${file}: not listed in the manifest`))
  return errors.sort()
}

/**
 * Refuses a VS Data release that fails verification, or that describes an MFM no rules version here
 * plays: its summaries would show on cards printing other rules.
 */
export function checkVsDataRelease(directory: string, editions: readonly { id: string; name: string }[]) {
  const errors = vsDataReleaseErrors(directory)
  if (errors.length) throw new Error(`VS Data release failed verification:\n${errors.join('\n')}`)
  const { rulesVersion } = readVsDataManifest(directory)!
  const edition = vsDataEdition(rulesVersion, editions)
  if (!edition) throw new Error(`VS Data release describes ${describe(rulesVersion)}, which no rules version plays`)
  return edition
}

/** A Stratagem record's typed facts, or none for any other record; the limit is read only from versioned facts. */
function stratagemOf(
  { kind, id, data }: z.infer<typeof recordSchema>,
  identity: readonly { kind: string; id: string; name?: string }[],
): VsDataStratagem[] {
  const stratagem = typedStratagemSchema.safeParse(data.stratagem)
  if (kind !== 'ability' || !data.ruleType || !STRATAGEM_RULE_TYPES.has(data.ruleType) || data.cp === undefined || !stratagem.success)
    return []
  const name = identity.find((entry) => entry.kind === kind && entry.id === id)?.name
  const core = data.ruleType === 'core-stratagem'
  const detachment = core ? null : (identity.find((entry) => entry.kind === 'detachment' && entry.id === data.detachment?.id)?.name ?? null)
  const facts = factsSchema.safeParse(data.facts)
  const parsed = vsDataStratagemSchema.safeParse({
    id,
    name,
    detachment,
    cp: data.cp,
    phases: stratagem.data.phases,
    turn: stratagem.data.turn,
    ...(stratagem.data.windows ? { windows: stratagem.data.windows } : {}),
    type: stratagem.data.type ?? null,
    limit: (facts.success && facts.data.fields.stratagem?.limit) || null,
  })
  return parsed.success && (core || detachment) ? [parsed.data] : []
}

const unitDataSchema = z.object({
  sizes: z.array(z.number().int()).default([]),
  defaults: z.record(z.string(), z.record(z.string(), z.number().int())).optional(),
  defaultModels: z.record(z.string(), z.number().int()).optional(),
})
const modelDataSchema = z.object({
  unit: z.string(),
  min: z.number().int(),
  max: z.number().int(),
  wargear: z.record(z.string(), z.number().int()).default({}),
})
const optionDataSchema = z.object({
  unit: z.string(),
  carrier: z.string().optional(),
  per: z.union([z.literal('carrier'), z.object({ models: z.number().int() })]).nullish(),
  choose: z.object({ min: z.number().int(), max: z.number().int() }),
  choices: z.array(z.string()),
  replaces: z.record(z.string(), z.number().int()).optional(),
  caps: z
    .array(
      z.object({
        choices: z.array(z.string()),
        max: z.number().int(),
        per: z.union([z.literal('carrier'), z.object({ models: z.number().int() })]).nullish(),
      }),
    )
    .optional(),
})
const invulnerableSaveSchema = z.object({
  roll: z.number().int(),
  against: z.enum(['ranged', 'melee']).optional(),
  conditional: z.literal(true).optional(),
  summary: z.string().optional(),
})
// A profile can hold several saves, as Wyches' against ranged attacks and against melee ones.
const unitProfileDataSchema = z.object({
  unit: z.string(),
  invulnerableSave: z.union([invulnerableSaveSchema, z.array(invulnerableSaveSchema)]).optional(),
})
const transportDataSchema = z.object({
  unit: z.string(),
  capacity: vsDataUnitSchema.shape.transport.unwrap().omit({ firingDeck: true }).optional(),
  firingDeck: z.number().int().optional(),
})

/**
 * Each unit's datasheet data from the release's roster definitions and transport facts, with its models and wargear
 * named, and no field a datasheet does not show, then each other unit the identity aliases to a BSData entry, as a
 * Crucible datasheet has only its abilities, so a datasheet finds its unit and that unit's abilities.
 */
function compactUnits(
  manifest: VsDataManifest,
  read: (name: string) => unknown,
  identity: readonly { kind: string; id: string; name?: string; aliases?: readonly string[]; retired?: unknown }[],
) {
  const names = new Map(identity.map((entry) => [entry.id, entry.name]))
  const named = (id: string) => names.get(id) ?? id
  const counted = (counts: Record<string, number>) => Object.entries(counts).map(([id, count]) => [named(id), count] as [string, number])
  const recordsOf = (category: string, kind: string) =>
    (manifest.categories.find((candidate) => candidate.name === category)?.records ?? [])
      .filter((entry) => entry.path.split('/')[2] === kind)
      .map((entry) => read(entry.path) as { id: string; rulesVersion?: { update?: string }; data: unknown })
      .filter((record) => record.rulesVersion?.update === manifest.rulesVersion.update)
  const units: Record<string, VsDataUnit> = {}
  const unitOf = (id: string) => (units[id] ??= { sizes: [], models: [], options: [] })
  const unitData = recordsOf('rosters', 'unit').map((record) => ({ id: record.id, data: unitDataSchema.parse(record.data) }))
  for (const { id, data } of unitData) {
    unitOf(id).sizes = data.sizes
    if (data.defaultModels) unitOf(id).defaultModels = counted(data.defaultModels)
  }
  for (const record of recordsOf('rosters', 'model')) {
    const data = modelDataSchema.parse(record.data)
    unitOf(data.unit).models.push({ name: named(record.id), min: data.min, max: data.max, wargear: counted(data.wargear) })
  }
  const options = new Map<string, VsDataUnit['options'][number]>()
  for (const record of recordsOf('rosters', 'roster-option')) {
    const data = optionDataSchema.parse(record.data)
    const option: VsDataUnit['options'][number] = {
      ...(data.carrier ? { carrier: named(data.carrier) } : {}),
      ...(data.per && data.per !== 'carrier' ? { perModels: data.per.models } : {}),
      choose: data.choose,
      choices: data.choices.map(named),
      ...(data.replaces ? { replaces: counted(data.replaces) } : {}),
      ...(data.caps
        ? {
            caps: data.caps.map((cap) => ({
              choices: cap.choices.map(named),
              max: cap.max,
              ...(cap.per && cap.per !== 'carrier' ? { perModels: cap.per.models } : {}),
            })),
          }
        : {}),
    }
    options.set(record.id, option)
    unitOf(data.unit).options.push(option)
  }
  for (const { data } of unitData)
    for (const [id, defaults] of Object.entries(data.defaults ?? {})) {
      const option = options.get(id)
      if (option) option.defaults = counted(defaults)
    }
  // A condition's summary is kept as the profile's own record, so it is served and withheld as any other summary is.
  const conditions: { kind: string; id: string; summary: string }[] = []
  for (const record of recordsOf('profiles', 'unit-profile')) {
    const { unit, invulnerableSave } = unitProfileDataSchema.parse(record.data)
    const saves = invulnerableSave === undefined ? [] : [invulnerableSave].flat()
    for (const [at, save] of saves.entries()) {
      // Each condition is its own record, named by the profile and, where it holds several, the save's place.
      const condition = saves.length > 1 ? `${record.id}#${at}` : record.id
      unitOf(unit).invulnerableSaves = [
        ...(unitOf(unit).invulnerableSaves ?? []),
        {
          profile: record.id,
          ...(record.id !== unit ? { model: named(record.id) } : {}),
          roll: save.roll,
          ...(save.against ? { against: save.against } : {}),
          ...(save.conditional ? { conditional: true as const } : {}),
          ...(save.summary ? { condition } : {}),
        },
      ]
      if (save.summary) conditions.push({ kind: 'unit-profile', id: condition, summary: save.summary })
    }
  }
  for (const record of recordsOf('profiles', 'transport-profile')) {
    const data = transportDataSchema.parse(record.data)
    if (data.capacity || data.firingDeck !== undefined)
      unitOf(data.unit).transport = { ...data.capacity, ...(data.firingDeck !== undefined ? { firingDeck: data.firingDeck } : {}) }
  }
  for (const entry of identity)
    if (entry.kind === 'unit' && !entry.retired && entry.aliases?.some((alias) => alias.startsWith('bsdata.'))) unitOf(entry.id)
  return { units, conditions }
}

const detachmentDataSchema = z.object({
  absent: z.literal(true).optional(),
  stratagems: z.array(z.string()).default([]),
  stratagemsUnlisted: z.array(z.string()).default([]),
  enhancements: z.array(z.string()).default([]),
  enhancementsUnlisted: z.array(z.string()).default([]),
})

/**
 * Each Detachment the release's roster records list for its rules version, named, with what its build prints, then each
 * the identity marks absent from that build, which has no roster record.
 */
function detachmentsOf(
  manifest: VsDataManifest,
  read: (name: string) => unknown,
  identity: readonly { kind: string; id: string; name?: string; absent?: true }[],
): VsDataDetachment[] {
  const names = new Map(identity.flatMap((entry) => (entry.kind === 'detachment' && entry.name ? [[entry.id, entry.name] as const] : [])))
  const absent = identity.flatMap((entry) =>
    entry.kind === 'detachment' && entry.absent && entry.name
      ? [{ name: entry.name, ...detachmentDataSchema.parse({ absent: true }) }]
      : [],
  )
  const listed = (manifest.categories.find((category) => category.name === 'rosters')?.records ?? [])
    .filter((entry) => entry.path.split('/')[2] === 'detachment')
    .map((entry) => read(entry.path) as { id: string; rulesVersion?: { update?: string }; data: unknown })
    .filter((record) => record.rulesVersion?.update === manifest.rulesVersion.update)
    .flatMap((record) => {
      const name = names.get(record.id)
      const lists = detachmentDataSchema.safeParse(record.data)
      return name && lists.success ? [{ name, ...lists.data }] : []
    })
  return [...listed, ...absent]
}

/**
 * Each datasheet and ability the identity marks absent from this rules version, by BSData ids: the profile's where the
 * ability has a BSData alias, and otherwise its `abilityKey`, as several absent rows sharing one alias keep none.
 */
function absentAbilitiesOf(
  identity: readonly {
    kind: string
    id: string
    name?: string
    aliases?: readonly string[]
    absent?: true
    references?: readonly { kind: string; id: string }[]
  }[],
) {
  const bsdata = (aliases: readonly string[] | undefined) =>
    (aliases ?? []).flatMap((alias) => (alias.startsWith('bsdata.') ? [alias.slice('bsdata.'.length).replaceAll('.', '-')] : []))
  const unitAliases = new Map(identity.flatMap((entry) => (entry.kind === 'unit' ? [[entry.id, bsdata(entry.aliases)] as const] : [])))
  const profiles: [string, string][] = []
  const names: [string, string][] = []
  const detachments: [string, string][] = []
  for (const entry of identity) {
    if (entry.kind !== 'ability' || !entry.absent) continue
    const own = bsdata(entry.aliases)
    // A Detachment's rule is hidden under that Detachment, by the VS Data id it names it by.
    if (entry.name)
      for (const reference of entry.references ?? [])
        if (reference.kind === 'detachment') detachments.push([reference.id, abilityKey(entry.name)])
    for (const reference of entry.references ?? [])
      for (const datasheet of reference.kind === 'unit' ? (unitAliases.get(reference.id) ?? []) : []) {
        if (own.length) profiles.push(...own.map((profile): [string, string] => [datasheet, profile]))
        else if (entry.name) names.push([datasheet, abilityKey(entry.name)])
      }
  }
  return { profiles, names, detachments }
}

const describe = ({ edition, update }: VsDataRulesVersion) => `${edition} ${update}`

/**
 * Reduces a verified release to the one file Praetorium reads, `file`, so the snapshot does not carry thousands of
 * record files and the identity: each summary of the release's rules version, the aliases of every current entry a
 * summary is for or links to, each Stratagem's typed facts and the mission packs. The unpacked release is removed.
 */
export function compactVsDataRelease(directory: string, file: string) {
  const manifest = readVsDataManifest(directory)!
  const read = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
  const identity = identitySchema.parse(read(manifest.identity.path)).entries
  const { units, conditions } = compactUnits(manifest, read, identity)
  const records = [
    ...manifest.categories
      .filter((category) => SUMMARY_CATEGORIES.has(category.name))
      .flatMap((category) => category.records)
      .map((entry) => read(entry.path))
      // A record without a summary of its own reads as having none, as any other gap does.
      .filter(hasSummary)
      .map((record) => recordSchema.parse(record))
      .filter((record) => record.rulesVersion.update === manifest.rulesVersion.update),
    ...conditions.map(({ kind, id, summary }) => recordSchema.parse({ kind, id, rulesVersion: manifest.rulesVersion, data: { summary } })),
  ]
  const wanted = new Set(
    records.flatMap((record) => [
      vsDataKey(record),
      ...(record.data.summarySpans ?? []).flatMap((span) => (span.target ? [vsDataKey(span.target)] : [])),
      ...summaryBlocks(record.data.summary)
        .flatMap((block) => ('paragraph' in block ? block.paragraph : block.items.flat()))
        .flatMap((run) => (run.target ? [vsDataKey(run.target)] : [])),
    ]),
  )
  // A record published once for several units names them, so each keeps the shared abilities it is one of.
  for (const entry of identity)
    if (entry.kind === 'ability' && entry.id.startsWith('shared.') && !entry.retired)
      for (const reference of entry.references ?? [])
        if (reference.kind === 'unit' && units[reference.id])
          units[reference.id]!.shared = [...(units[reference.id]!.shared ?? []), entry.id]
  for (const id of Object.keys(units)) wanted.add(vsDataKey({ kind: 'unit', id }))
  const current = identity.filter((entry) => !entry.retired)
  const entries = current.filter((entry) => wanted.has(vsDataKey(entry)))
  const absent = absentAbilitiesOf(current)
  const compact: VsDataSummariesFile = {
    release: manifest.release,
    rulesVersion: manifest.rulesVersion,
    entries: Object.fromEntries(entries.map((entry) => [vsDataKey(entry), entry.aliases ?? []])),
    stratagems: records.flatMap((record) => stratagemOf(record, current)),
    missionPacks: manifest.categories
      .filter((category) => category.name === MISSION_PACKS)
      .flatMap((category) => category.records)
      .map((entry) => packRecordSchema.parse(read(entry.path)))
      .filter((record) => record.rulesVersion.update === manifest.rulesVersion.update)
      .map((record) => record.data),
    missionActions: current.flatMap((entry) => (entry.kind === 'mission-action' && entry.name ? [{ id: entry.id, name: entry.name }] : [])),
    detachments: detachmentsOf(manifest, read, current),
    ...(absent.profiles.length ? { absentAbilities: absent.profiles } : {}),
    ...(absent.names.length ? { absentAbilityNames: absent.names } : {}),
    ...(absent.detachments.length ? { absentDetachmentRules: absent.detachments } : {}),
    units,
    factions: Object.fromEntries(
      current.flatMap((entry) => (entry.kind === 'faction' && entry.name ? [[entry.name, entry.id] as const] : [])),
    ),
    attributions: [
      ...new Map(
        records.flatMap(({ attribution }) =>
          attribution
            ? [
                [
                  `${attribution.credit} ${attribution.licence}`,
                  { credit: attribution.credit, url: attribution.url, licence: attribution.licence },
                ],
              ]
            : [],
        ),
      ).values(),
    ],
    records: records.map(({ kind, id, data }) => ({
      kind,
      id,
      summary: data.summary,
      spans: data.summarySpans ?? [],
      questions: (data.interpretation ?? []).map(({ question }) => question),
    })),
  }
  fs.rmSync(directory, { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(compact)}\n`)
}
