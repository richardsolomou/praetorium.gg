import fs from 'node:fs'
import path from 'node:path'
import { RecentlyUsed, remember } from '../core/collections'
import { sourceStrings } from '../core/sourceText'
import {
  MISSION_SUMMARIES,
  type RuleDocument,
  type RuleSummaries,
  type RuleSummary,
  type RuleSummaryInline,
  type RuleSummaryLink,
} from '../contracts/rules'
import { spannedParagraph, type SummaryInline, summaryBlocks, summaryText } from '../core/summaryMarkdown'
import type { Steps } from '../shared/steps'
import {
  type GdcRuleKind,
  gdcRuleRecords,
  vsDataIndex,
  vsDataKey,
  type VsDataAttribution,
  type VsDataSummariesFile,
  vsDataSummariesSchema,
} from '../shared/vsData'
import { readCatalogueComposition } from './catalogueComposition'
import { editionTextFiles, textHash } from './sourceTexts'

export const NO_RULE_SUMMARIES: RuleSummaries = { records: {}, texts: {}, entries: {} }

/** One Game Datacards record of a summarized rules version: whether VS Data names it, and whether its summary is served. */
export type VsDataJoin = { kind: GdcRuleKind; key: string; named: boolean; served: boolean }

export type VsDataSummaries = {
  /** The rules versions the pinned releases describe, the base first. */
  editions: string[]
  /**
   * The summaries for the rules one Game Datacards file prints, by the file's token ID, read for its rules version;
   * or, for `MISSION_SUMMARIES`, the current rules' mission records by `kind:id`.
   */
  summariesIn: (file: string) => RuleSummaries
  /** Every Game Datacards record of one rules version, once each, for the coverage report. */
  joins: (edition: string) => VsDataJoin[]
  /**
   * The current rules version's summaries of the weapon and core abilities, by `kind:id`, which a keyword's tooltip
   * and a summary naming the ability show.
   */
  abilities: () => Record<string, RuleSummary>
  /** The upstream work the served summaries adapt, once each, which the Sources page credits. */
  attributions: () => VsDataAttribution[]
}

type Version = {
  edition: string
  index: ReturnType<typeof vsDataIndex>
  summaries: Map<string, RuleSummary>
}

/**
 * The pinned VS Data releases, one file each, every one read for the rules version it describes and only once a rule
 * of that version is asked for, as a server mostly serves the current one. Materializing has already withheld every
 * summary repeating a source's words (`withholdCopiedSummaries`). A file several rules versions hold alike, which their
 * tokens name alike, is read as the base's where the base holds it. Links to core rules land on their rules pages.
 */
export function* vsDataSummariesSteps(directory: string, documents: readonly RuleDocument[]): Steps<VsDataSummaries | null> {
  const folder = path.join(directory, 'summaries')
  const order = (readCatalogueComposition(directory)?.editions ?? []).toSorted(
    (left, right) => Number(right.base ?? false) - Number(left.base ?? false),
  )
  // Materializing names each file for the rules version its release describes; a snapshot published before releases
  // were kept this way holds other files here, which name none.
  const held = order.filter((entry) => fs.existsSync(path.join(folder, `${entry.edition.id}.json`)))
  if (!held.length) return null
  const release = (edition: string) => {
    const parsed = vsDataSummariesSchema.safeParse(readJson(path.join(folder, `${edition}.json`)))
    return parsed.success ? parsed.data : null
  }
  const links = ruleLinks(documents)
  const versions = new Map<string, Version | null>()
  const versionOf = (edition: string) =>
    remember(versions, edition, () => {
      const file = release(edition)
      if (!file) return null
      const index = vsDataIndex(file.entries)
      const link = (target: { kind: string; id: string }) =>
        index
          .aliasesOf(target)
          .map((alias) => links.get(alias))
          .find(Boolean)
      const abilities = new Set(file.records.flatMap((record) => (ABILITY_KINDS.includes(record.kind) ? [vsDataKey(record)] : [])))
      return { edition, index, summaries: new Map(file.records.map((record) => [vsDataKey(record), summaryOf(record, link, abilities)])) }
    })
  const filesOf = (entry: (typeof held)[number]) => editionTextFiles(directory, entry.base ? null : entry.edition.id)
  const cards = new Map<string, { file: string; edition: string }>()
  for (const entry of held)
    for (const file of filesOf(entry))
      if (file.source === 'game-datacards' && !cards.has(file.id)) cards.set(file.id, { file: file.path, edition: entry.edition.id })
  yield
  const read = (file: string) => gdcRuleRecords(readJson(file))
  const answers = new RecentlyUsed<string, RuleSummaries>(16)
  return {
    editions: held.map((entry) => entry.edition.id),
    abilities: () =>
      Object.fromEntries(
        [...(versionOf(held[0]!.edition.id)?.summaries ?? [])].filter(([key]) => ABILITY_KINDS.some((kind) => key.startsWith(`${kind}:`))),
      ),
    // Read without keeping the versions, as only the Sources page asks.
    attributions: () => [
      ...new Map(
        held
          .flatMap((entry) => release(entry.edition.id)?.attributions ?? [])
          .map((credit) => [`${credit.credit} ${credit.licence}`, credit]),
      ).values(),
    ],
    summariesIn: (id) => {
      if (id === MISSION_SUMMARIES) {
        const version = versionOf(held[0]!.edition.id)
        return version ? remember(answers, id, () => missionSummaries(version.summaries)) : NO_RULE_SUMMARIES
      }
      const card = cards.get(id)
      const version = card && versionOf(card.edition)
      return card && version
        ? remember(answers, id, () => summariesFor(read(card.file), version.index, version.summaries))
        : NO_RULE_SUMMARIES
    },
    joins: (edition) => {
      const joins = new Map<string, VsDataJoin>()
      const entry = held.find((candidate) => candidate.edition.id === edition)
      const version = entry && versionOf(edition)
      for (const file of entry && version ? filesOf(entry) : [])
        if (file.source === 'game-datacards')
          for (const { kind, keys } of read(file.path)) {
            const ref = version!.index.entry(keys)
            joins.set(keys[0]!, {
              kind,
              key: keys[0]!,
              named: Boolean(ref),
              served: Boolean(ref && version!.summaries.has(vsDataKey(ref))),
            })
          }
      return [...joins.values()]
    },
  }
}

const MISSION_KINDS = ['mission-card:', 'mission-award:', 'mission-action:', 'mission-twist:']

function missionSummaries(summaries: ReadonlyMap<string, RuleSummary>): RuleSummaries {
  const records = [...summaries].filter(([key]) => MISSION_KINDS.some((kind) => key.startsWith(kind)))
  return { records: Object.fromEntries(records), texts: {}, entries: {} }
}

/**
 * The compacted VS Data release a rules version reads, the base rules version's by default, or null where the
 * snapshot holds none for it.
 */
export function readVsDataRelease(directory: string, edition?: string): VsDataSummariesFile | null {
  const id = edition ?? readCatalogueComposition(directory)?.editions.find((entry) => entry.base)?.edition.id
  const file = id ? path.join(directory, 'summaries', `${id}.json`) : null
  if (!file || !fs.existsSync(file)) return null
  const parsed = vsDataSummariesSchema.safeParse(readJson(file))
  return parsed.success ? parsed.data : null
}

function summariesFor(
  records: ReturnType<typeof gdcRuleRecords>,
  index: ReturnType<typeof vsDataIndex>,
  summaries: ReadonlyMap<string, RuleSummary>,
) {
  const answer: RuleSummaries = { records: {}, texts: {}, entries: {} }
  for (const { keys, texts, entry } of records) {
    const ref = index.entry(keys)
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

/** The kinds of VS Data record a keyword chip names, whose summaries a tooltip shows. */
const ABILITY_KINDS = ['weapon-ability', 'core-ability']

function summaryOf(
  { summary, spans, questions }: VsDataSummariesFile['records'][number],
  link: (target: { kind: string; id: string }) => RuleSummaryLink | undefined,
  abilities: ReadonlySet<string>,
): RuleSummary {
  const blocks = spans.length ? [spannedParagraph(summary, spans)] : summaryBlocks(summary)
  const runs = (inlines: SummaryInline[]) => inlines.flatMap((inline) => served(inline, link, abilities))
  return {
    blocks: blocks.map((block) =>
      'paragraph' in block ? { paragraph: runs(block.paragraph) } : { list: block.list, items: block.items.map(runs) },
    ),
    questions,
  }
}

/**
 * A run as it is served: a link to the rule it names, or the ability whose summary its tooltip shows. A summary prints
 * a weapon ability in brackets, as the cards do, often without naming it, so a bracketed name in plain text is one too.
 */
function served(
  { text, bold, target }: SummaryInline,
  link: (target: { kind: string; id: string }) => RuleSummaryLink | undefined,
  abilities: ReadonlySet<string>,
): RuleSummaryInline[] {
  const emphasis = bold ? { bold: true as const } : {}
  if (target) {
    const to = link(target)
    const ability = abilities.has(vsDataKey(target)) ? vsDataKey(target) : undefined
    return [{ text, ...emphasis, ...(to ? { link: to } : {}), ...(ability ? { ability } : {}) }]
  }
  const runs: RuleSummaryInline[] = []
  let read = 0
  for (const match of text.matchAll(/\[([^[\]]+)\]/g)) {
    const ability = bracketedAbility(match[1]!, abilities)
    if (!ability) continue
    if (match.index > read) runs.push({ text: text.slice(read, match.index), ...emphasis })
    runs.push({ text: match[0], ...emphasis, ability })
    read = match.index + match[0].length
  }
  if (read < text.length) runs.push({ text: text.slice(read), ...emphasis })
  return runs
}

/** The ability a bracketed name such as `ANTI-INFANTRY 3+` or `SUSTAINED HITS D3` is, by its key, where VS Data has it. */
function bracketedAbility(printed: string, abilities: ReadonlySet<string>) {
  const name = printed
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:\s+(?:\d*d\d+(?:\+\d+)?|\d+\+?|x\+?))+$/, '')
    .replace(/^anti-.*/, 'anti')
  // A qualified ability such as `LETHAL HITS: non-VEHICLE` is the ability itself where VS Data keeps no record of the qualified one.
  const slugs = [name, name.split(':')[0]!].map((form) => form.replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, ''))
  return slugs.flatMap((slug) => ABILITY_KINDS.map((kind) => `${kind}:${slug}`)).find((key) => abilities.has(key))
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

/**
 * Removes from each materialized release every summary that repeats, as a whole or in a sentence, a string of a source
 * file of the rules version it describes, so nothing served can be a source's words, and names what it removed as
 * `edition kind:id`. A file several rules versions hold is read once.
 */
export function withholdCopiedSummaries(directory: string): string[] {
  const folder = path.join(directory, 'summaries')
  const entries = (readCatalogueComposition(directory)?.editions ?? []).filter((entry) =>
    fs.existsSync(path.join(folder, `${entry.edition.id}.json`)),
  )
  const releases = entries.map((entry) => ({
    edition: entry.edition.id,
    file: path.join(folder, `${entry.edition.id}.json`),
    release: vsDataSummariesSchema.parse(readJson(path.join(folder, `${entry.edition.id}.json`))),
    files: editionTextFiles(directory, entry.base ? null : entry.edition.id),
  }))
  const byWording = new Map<string, { edition: string; key: string }[]>()
  for (const { edition, release } of releases)
    for (const record of release.records)
      for (const wording of wordingsOf(summaryText(record.summary)))
        remember(byWording, wording, () => []).push({ edition, key: vsDataKey(record) })
  const readers = new Map<string, Set<string>>()
  for (const { edition, files } of releases) for (const file of files) remember(readers, file.path, () => new Set()).add(edition)
  const withheld = new Set<string>()
  for (const [file, editions] of readers)
    for (const text of sourceStrings(readJson(file)))
      for (const wording of wordingsOf(text))
        for (const found of byWording.get(wording) ?? []) if (editions.has(found.edition)) withheld.add(`${found.edition} ${found.key}`)
  for (const { edition, file, release } of releases) {
    const records = release.records.filter((record) => !withheld.has(`${edition} ${vsDataKey(record)}`))
    if (records.length !== release.records.length) fs.writeFileSync(file, JSON.stringify({ ...release, records }))
  }
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
