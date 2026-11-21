import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import rawMapping from '../../catalogue/rule-summaries.json' with { type: 'json' }
import { catalogueEditionId } from '../core/catalogueEdition'
import { remember } from '../core/collections'
import { readCatalogueComposition } from './catalogueComposition'
import { isSafeRelativePath } from './relativePath'

const rulesVersionSchema = z.object({ edition: z.string().min(1), update: z.string().min(1) })
const mapping = z
  .object({
    rulesVersions: z.record(z.string(), rulesVersionSchema),
    records: z.record(z.string(), z.object({ rulesVersion: z.string(), datacards: z.string().min(1) })),
  })
  .parse(rawMapping)
const releasePath = z.object({ path: z.string().refine(isSafeRelativePath) })
const manifestSchema = z.object({ records: z.array(z.object({ id: z.string(), record: releasePath, summary: releasePath })) })
const recordSchema = z.object({ id: z.string(), rulesVersion: rulesVersionSchema })

/** Rules summaries by Game Datacards record ID, for the rules version a catalogue ID names. */
export type RuleSummaries = (catalogueId: string) => ReadonlyMap<string, string>

const none: ReadonlyMap<string, string> = new Map()
export const noRuleSummaries: RuleSummaries = () => none

/**
 * The pinned summaries release, joined to Praetorium's records through `catalogue/rule-summaries.json`.
 * A summary is kept only where the rules version its record states is the one the mapping names, so a
 * record written for another update shows the source's own text instead.
 */
export function loadRuleSummaries(directory: string): RuleSummaries {
  const folder = path.join(directory, 'summaries')
  const manifestFile = path.join(folder, 'manifest.json')
  if (!fs.existsSync(manifestFile)) return noRuleSummaries
  const read = (file: string) => fs.readFileSync(path.join(folder, file), 'utf8')
  const byVersion = new Map<string, Map<string, string>>()
  for (const entry of manifestSchema.parse(JSON.parse(read('manifest.json'))).records) {
    const mapped = mapping.records[entry.id]
    if (!mapped) continue
    const record = recordSchema.parse(JSON.parse(read(entry.record.path)))
    if (record.id !== entry.id || !isDeepStrictEqual(record.rulesVersion, mapping.rulesVersions[mapped.rulesVersion])) continue
    remember(byVersion, mapped.rulesVersion, () => new Map()).set(mapped.datacards, read(entry.summary.path).trim())
  }
  // An unqualified catalogue ID reads the base rules version.
  const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)?.edition.id
  return (catalogueId) => byVersion.get(catalogueEditionId(catalogueId) ?? base ?? '') ?? none
}
