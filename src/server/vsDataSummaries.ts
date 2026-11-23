import fs from 'node:fs'
import path from 'node:path'
import { RecentlyUsed, remember } from '../core/collections'
import { sourceStrings } from '../core/sourceText'
import type { RuleDocument, RuleSummaries, RuleSummary, RuleSummaryLink } from '../contracts/rules'
import type { Steps } from '../shared/steps'
import {
  type GdcRuleKind,
  gdcRuleRecords,
  vsDataEdition,
  vsDataIdentitySchema,
  vsDataIndex,
  vsDataKey,
  vsDataRecordSchema,
  type VsDataRecord,
} from '../shared/vsData'
import { readCatalogueComposition } from './catalogueComposition'
import { textFileId, textHash, textSourcePaths } from './sourceTexts'
import { readVsDataManifest } from './vsDataRelease'

export const NO_RULE_SUMMARIES: RuleSummaries = { records: {}, texts: {}, entries: {} }

/** One Game Datacards record of the summarized rules version: whether VS Data names it, and whether its summary is served. */
export type VsDataJoin = { kind: GdcRuleKind; key: string; named: boolean; served: boolean }

export type VsDataSummaries = {
  /** The rules version the summaries describe. */
  edition: string
  /** The summaries for the rules one Game Datacards file of that version prints, by the file's token ID. */
  summariesIn: (file: string) => RuleSummaries
  /** Every Game Datacards record of that version, once each, for the coverage report. */
  joins: () => VsDataJoin[]
  /** The summaries dropped because they repeat a source's own wording. */
  withheld: readonly string[]
}

/**
 * The pinned VS Data release, read for the rules version it describes, which must be the snapshot's
 * base or one of its rules versions. A summary repeating a sentence of either source's rules text is
 * withheld, so nothing served can be their words. Links to core rules land on their rules pages.
 */
export function* vsDataSummariesSteps(directory: string, documents: readonly RuleDocument[]): Steps<VsDataSummaries | null> {
  const folder = path.join(directory, 'summaries')
  const manifest = readVsDataManifest(folder)
  const composition = readCatalogueComposition(directory)
  const edition = manifest && vsDataEdition(manifest.rulesVersion)
  const version = composition?.editions.find((entry) => entry.edition.id === edition)
  if (!manifest || !edition || !version) return null
  const prefix = version.base ? null : `editions/${edition}/`
  const files = textSourcePaths(directory, composition).filter((file) => {
    const relative = path.relative(directory, file.path).split(path.sep).join('/')
    return prefix ? relative.startsWith(prefix) : !relative.startsWith('editions/')
  })
  const index = vsDataIndex(vsDataIdentitySchema.parse(readJson(path.join(folder, manifest.identity.path))))
  const links = ruleLinks(documents)
  const summaries = new Map<string, RuleSummary>()
  for (const category of manifest.categories)
    for (const entry of category.records) {
      const record = vsDataRecordSchema.parse(readJson(path.join(folder, entry.path)))
      if (record.rulesVersion.update !== manifest.rulesVersion.update) continue
      summaries.set(
        vsDataKey(record),
        summaryOf(record, (target) =>
          index
            .aliasesOf(target)
            .map((alias) => links.get(alias))
            .find(Boolean),
        ),
      )
      if (summaries.size % 256 === 0) yield
    }
  const withheld = yield* withoutOriginalWording(summaries, files)
  const cards = new Map(files.filter((file) => file.source === 'game-datacards').map((file) => [textFileId(file.url), file.path]))
  const read = (file: string) => gdcRuleRecords(readJson(file))
  const held = new RecentlyUsed<string, RuleSummaries>(16)
  return {
    edition,
    withheld,
    summariesIn: (id) => {
      const file = cards.get(id)
      return file ? remember(held, id, () => summariesFor(read(file), index, summaries)) : NO_RULE_SUMMARIES
    },
    joins: () => {
      const joins = new Map<string, VsDataJoin>()
      for (const { kind, key } of [...cards.values()].flatMap(read)) {
        const ref = index.entry(key)
        joins.set(key, { kind, key, named: Boolean(ref), served: Boolean(ref && summaries.has(vsDataKey(ref))) })
      }
      return [...joins.values()]
    },
  }
}

function summariesFor(
  records: ReturnType<typeof gdcRuleRecords>,
  index: ReturnType<typeof vsDataIndex>,
  summaries: ReadonlyMap<string, RuleSummary>,
) {
  const answer: RuleSummaries = { records: {}, texts: {}, entries: {} }
  for (const { key, texts, entry } of records) {
    const ref = index.entry(key)
    const id = ref && vsDataKey(ref)
    const summary = id && summaries.get(id)
    if (!id || !summary) continue
    answer.records[id] = summary
    if (entry) answer.entries[entry] = id
    for (const hash of new Set(texts.flatMap((text) => [textHash(text), textHash(text.trim())]))) {
      const holders = (answer.texts[hash] ??= [])
      if (!holders.includes(id)) holders.push(id)
    }
  }
  return answer
}

function summaryOf(record: VsDataRecord, link: (target: { kind: string; id: string }) => RuleSummaryLink | undefined): RuleSummary {
  const { summary, summarySpans = [], citations, interpretation = [] } = record.data
  const publisher = citations.find((citation) => citation.type === 'publisher')
  return {
    summary,
    spans: summarySpans.flatMap(({ start, end, bold, target }) => {
      const to = target && link(target)
      return bold || to ? [{ start, end, ...(bold ? { bold } : {}), ...(to ? { link: to } : {}) }] : []
    }),
    citation: publisher ? { title: publisher.title, url: publisher.url, page: publisher.page ?? null } : null,
    questions: interpretation.map(({ question }) => question),
  }
}

/** Each rules-document entry's page and anchor, by the entry's id. */
function ruleLinks(documents: readonly RuleDocument[]) {
  const links = new Map<string, RuleSummaryLink>()
  for (const document of documents)
    for (const section of document.sections)
      for (const entry of section.entries)
        if (!links.has(entry.id)) links.set(entry.id, { document: document.slug, section: section.slug, anchor: entry.anchor })
  return links
}

/** Removes each summary that repeats, as a whole or in a sentence, a string of the source files, and names what it removed. */
function* withoutOriginalWording(summaries: Map<string, RuleSummary>, files: readonly { path: string }[]): Steps<string[]> {
  const byWording = new Map<string, string[]>()
  for (const [id, { summary }] of summaries) for (const wording of wordingsOf(summary)) remember(byWording, wording, () => []).push(id)
  const withheld = new Set<string>()
  for (const file of files) {
    for (const text of sourceStrings(readJson(file.path)))
      for (const wording of wordingsOf(text)) for (const id of byWording.get(wording) ?? []) withheld.add(id)
    yield
  }
  for (const id of withheld) summaries.delete(id)
  return [...withheld].toSorted()
}

/** A sentence this short says too little to be anybody's wording. */
const QUOTED_SENTENCE = 60

function wordingsOf(text: string) {
  const plain = text.replaceAll(/<[^>]+>/g, ' ').replaceAll(/[*_`#^■]/g, '')
  const sentences = plain.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length >= QUOTED_SENTENCE)
  return new Set([plain, ...sentences].map(comparable).filter(Boolean))
}

const comparable = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[\p{P}\p{S}]/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'))
