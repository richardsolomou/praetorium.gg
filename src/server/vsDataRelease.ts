import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { vsDataEdition, vsDataKey, type VsDataRulesVersion } from '../shared/vsData'

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

const MANIFEST = 'manifest.json'
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
export function checkVsDataRelease(directory: string, editions: readonly string[]) {
  const errors = vsDataReleaseErrors(directory)
  if (errors.length) throw new Error(`VS Data release failed verification:\n${errors.join('\n')}`)
  const { rulesVersion } = readVsDataManifest(directory)!
  const edition = vsDataEdition(rulesVersion)
  if (!edition || !editions.includes(edition))
    throw new Error(`VS Data release describes ${describe(rulesVersion)}, which no rules version plays`)
}

const describe = ({ edition, update }: VsDataRulesVersion) => `${edition} ${update}`
