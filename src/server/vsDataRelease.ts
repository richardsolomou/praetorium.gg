import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { type VsDataSummariesFile, vsDataEdition, vsDataKey, type VsDataRulesVersion } from '../shared/vsData'

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
  entries: z.array(refSchema.extend({ aliases: z.array(z.string()).optional(), retired: z.unknown().optional() })),
})
const recordSchema = refSchema.extend({
  rulesVersion: z.object({ update: z.string() }),
  data: z.object({
    summary: z.string().min(1),
    summarySpans: z
      .array(z.object({ start: z.number().int(), end: z.number().int(), bold: z.literal(true).optional(), target: refSchema.optional() }))
      .optional(),
    citations: z.array(z.object({ type: z.string(), title: z.string(), url: z.string().optional(), page: z.string().optional() })),
    interpretation: z.array(z.object({ question: z.string() })).optional(),
  }),
})

const MANIFEST = 'manifest.json'
const IDENTITY = 'identity.json'
/** The one file the snapshot keeps of a VS Data release. */
export const VS_DATA_SUMMARIES = 'summaries.json'

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
export function checkVsDataRelease(directory: string, editions: readonly string[]) {
  const errors = vsDataReleaseErrors(directory)
  if (errors.length) throw new Error(`VS Data release failed verification:\n${errors.join('\n')}`)
  const { rulesVersion } = readVsDataManifest(directory)!
  const edition = vsDataEdition(rulesVersion)
  if (!edition || !editions.includes(edition))
    throw new Error(`VS Data release describes ${describe(rulesVersion)}, which no rules version plays`)
}

const describe = ({ edition, update }: VsDataRulesVersion) => `${edition} ${update}`

/**
 * Replaces a verified release with the one file Praetorium reads, so the snapshot does not carry thousands of
 * record files, the identity and the typed facts: each summary of the release's rules version, and the aliases
 * of every current entry a summary is for or links to.
 */
export function compactVsDataRelease(directory: string) {
  const manifest = readVsDataManifest(directory)!
  const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))
  const records = manifest.categories
    .flatMap((category) => category.records)
    .map((entry) => recordSchema.parse(read(entry.path)))
    .filter((record) => record.rulesVersion.update === manifest.rulesVersion.update)
  const wanted = new Set(
    records.flatMap((record) => [
      vsDataKey(record),
      ...(record.data.summarySpans ?? []).flatMap((span) => (span.target ? [vsDataKey(span.target)] : [])),
    ]),
  )
  const entries = identitySchema
    .parse(read(manifest.identity.path))
    .entries.filter((entry) => !entry.retired && wanted.has(vsDataKey(entry)))
  const compact: VsDataSummariesFile = {
    release: manifest.release,
    rulesVersion: manifest.rulesVersion,
    entries: Object.fromEntries(entries.map((entry) => [vsDataKey(entry), entry.aliases ?? []])),
    records: records.map(({ kind, id, data }) => {
      const publisher = data.citations.find((citation) => citation.type === 'publisher' && citation.url)
      return {
        kind,
        id,
        summary: data.summary,
        spans: data.summarySpans ?? [],
        citation: publisher ? { title: publisher.title, url: publisher.url!, page: publisher.page ?? null } : null,
        questions: (data.interpretation ?? []).map(({ question }) => question),
      }
    }),
  }
  fs.rmSync(directory, { recursive: true })
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, VS_DATA_SUMMARIES), `${JSON.stringify(compact)}\n`)
}
