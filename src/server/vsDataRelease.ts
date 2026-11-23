import { summaryBlocks } from '../core/summaryMarkdown'
import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  vsDataAttributionSchema,
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
    refSchema.extend({ name: z.string().optional(), aliases: z.array(z.string()).optional(), retired: z.unknown().optional() }),
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
  }),
})

const unresolvedSummary = (record: unknown) => {
  const summary = (record as { data?: { summary?: unknown } } | null)?.data?.summary
  return typeof summary === 'object' && summary !== null && 'unresolved' in summary
}

const MANIFEST = 'manifest.json'
/** The categories whose records are rule summaries; others, such as mission packs, hold data Praetorium reads elsewhere. */
const SUMMARY_CATEGORIES = new Set(['rules-reference', 'mission-rules'])
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

const unitDataSchema = z.object({ sizes: z.array(z.number().int()).default([]) })
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
const transportDataSchema = z.object({
  unit: z.string(),
  capacity: vsDataUnitSchema.shape.transport.unwrap().omit({ firingDeck: true }).optional(),
  firingDeck: z.number().int().optional(),
})

/**
 * Each unit's datasheet data from the release's roster definitions and transport facts, with its models and wargear
 * named, and no field a datasheet does not show.
 */
function compactUnits(
  manifest: VsDataManifest,
  read: (name: string) => unknown,
  identity: readonly { kind: string; id: string; name?: string }[],
): Record<string, VsDataUnit> {
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
  for (const record of recordsOf('rosters', 'unit')) unitOf(record.id).sizes = unitDataSchema.parse(record.data).sizes
  for (const record of recordsOf('rosters', 'model')) {
    const data = modelDataSchema.parse(record.data)
    unitOf(data.unit).models.push({ name: named(record.id), min: data.min, max: data.max, wargear: counted(data.wargear) })
  }
  for (const record of recordsOf('rosters', 'roster-option')) {
    const data = optionDataSchema.parse(record.data)
    unitOf(data.unit).options.push({
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
    })
  }
  for (const record of recordsOf('profiles', 'transport-profile')) {
    const data = transportDataSchema.parse(record.data)
    if (data.capacity || data.firingDeck !== undefined)
      unitOf(data.unit).transport = { ...data.capacity, ...(data.firingDeck !== undefined ? { firingDeck: data.firingDeck } : {}) }
  }
  return units
}

const describe = ({ edition, update }: VsDataRulesVersion) => `${edition} ${update}`

/**
 * Reduces a verified release to the one file Praetorium reads, `file`, so the snapshot does not carry thousands of
 * record files, the identity and the typed facts: each summary of the release's rules version, and the aliases
 * of every current entry a summary is for or links to. The unpacked release is removed.
 */
export function compactVsDataRelease(directory: string, file: string) {
  const manifest = readVsDataManifest(directory)!
  const read = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
  const records = manifest.categories
    .filter((category) => SUMMARY_CATEGORIES.has(category.name))
    .flatMap((category) => category.records)
    .map((entry) => read(entry.path))
    // A summary VS Data holds back as `{ "unresolved": … }` reads as no summary, as any other gap does.
    .filter((record) => !unresolvedSummary(record))
    .map((record) => recordSchema.parse(record))
    .filter((record) => record.rulesVersion.update === manifest.rulesVersion.update)
  const wanted = new Set(
    records.flatMap((record) => [
      vsDataKey(record),
      ...(record.data.summarySpans ?? []).flatMap((span) => (span.target ? [vsDataKey(span.target)] : [])),
      ...summaryBlocks(record.data.summary)
        .flatMap((block) => ('paragraph' in block ? block.paragraph : block.items.flat()))
        .flatMap((run) => (run.target ? [vsDataKey(run.target)] : [])),
    ]),
  )
  const identity = identitySchema.parse(read(manifest.identity.path)).entries
  const units = compactUnits(manifest, read, identity)
  for (const id of Object.keys(units)) wanted.add(vsDataKey({ kind: 'unit', id }))
  const entries = identity.filter((entry) => !entry.retired && wanted.has(vsDataKey(entry)))
  const compact: VsDataSummariesFile = {
    release: manifest.release,
    rulesVersion: manifest.rulesVersion,
    entries: Object.fromEntries(entries.map((entry) => [vsDataKey(entry), entry.aliases ?? []])),
    units,
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
