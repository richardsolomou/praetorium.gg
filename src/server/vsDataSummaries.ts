import fs from 'node:fs'
import path from 'node:path'
import { RecentlyUsed, remember } from '../core/collections'
import { sourceStrings } from '../core/sourceText'
import { MISSION_SUMMARIES, type RuleDocument, type RuleSummaries, type RuleSummary, type RuleSummaryLink, RuleSummarySpan } from '../contracts/rules'
import type { Steps } from '../shared/steps'
import {
  type GdcRuleKind,
  gdcRuleRecords,
  vsDataEdition,
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
  abilities: Record<string, RuleSummary>
  /** The upstream work the served summaries adapt, once each, which the Sources page credits. */
  attributions: VsDataAttribution[]
  /** The summaries dropped because they repeat a source's own wording, as `edition kind:id`. */
  withheld: readonly string[]
}

type Version = {
  edition: string
  attributions: VsDataAttribution[]
  files: ReturnType<typeof editionTextFiles>
  index: ReturnType<typeof vsDataIndex>
  summaries: Map<string, RuleSummary>
}

/**
 * The pinned VS Data releases, one file each, every one read for the rules version it describes. A summary
 * repeating a sentence of either source's rules text is withheld, so nothing served can be their words. A file several
 * rules versions hold alike, which their tokens name alike, is read as the base's where the base holds it. Links to
 * core rules land on their rules pages.
 */
export function* vsDataSummariesSteps(directory: string, documents: readonly RuleDocument[]): Steps<VsDataSummaries | null> {
  const folder = path.join(directory, 'summaries')
  const composition = readCatalogueComposition(directory)
  const editions = composition?.editions ?? []
  // A snapshot published before releases were kept this way holds other files here, which name no rules version.
  const releases = (fs.existsSync(folder) ? fs.readdirSync(folder) : []).flatMap((name) => {
    const parsed = name.endsWith('.json') ? vsDataSummariesSchema.safeParse(readJson(path.join(folder, name))) : null
    return parsed?.success ? [parsed.data] : []
  })
  const links = ruleLinks(documents)
  const versions: Version[] = []
  for (const release of releases) {
    const edition = vsDataEdition(
      release.rulesVersion,
      editions.map((entry) => entry.edition),
    )
    const version = editions.find((entry) => entry.edition.id === edition)
    if (!edition || !version) continue
    const files = editionTextFiles(directory, version.base ? null : edition)
    const index = vsDataIndex(release.entries)
    const link = (target: { kind: string; id: string }) =>
      index
        .aliasesOf(target)
        .map((alias) => links.get(alias))
        .find(Boolean)
    const abilities = new Set(release.records.flatMap((record) => (ABILITY_KINDS.includes(record.kind) ? [vsDataKey(record)] : [])))
    const summaries = new Map(release.records.map((record) => [vsDataKey(record), summaryOf(record, link, abilities)]))
    versions.push({ edition, attributions: release.attributions, files, index, summaries })
    yield
  }
  if (!versions.length) return null
  const order = (version: Version) => {
    const at = editions.findIndex((entry) => entry.edition.id === version.edition)
    return editions[at]?.base ? -1 : at
  }
  versions.sort((left, right) => order(left) - order(right))
  const withheld = yield* withoutOriginalWording(versions)
  const cards = new Map<string, { file: string; version: Version }>()
  for (const version of versions)
    for (const file of version.files)
      if (file.source === 'game-datacards' && !cards.has(file.id)) cards.set(file.id, { file: file.path, version })
  const read = (file: string) => gdcRuleRecords(readJson(file))
  const held = new RecentlyUsed<string, RuleSummaries>(16)
  return {
    editions: versions.map((version) => version.edition),
    abilities: Object.fromEntries([...versions[0]!.summaries].filter(([key]) => ABILITY_KINDS.some((kind) => key.startsWith(`${kind}:`)))),
    attributions: [
      ...new Map(
        versions.flatMap((version) => version.attributions).map((credit) => [`${credit.credit} ${credit.licence}`, credit]),
      ).values(),
    ],
    withheld,
    summariesIn: (id) => {
      if (id === MISSION_SUMMARIES) return remember(held, id, () => missionSummaries(versions[0]!.summaries))
      const card = cards.get(id)
      return card ? remember(held, id, () => summariesFor(read(card.file), card.version.index, card.version.summaries)) : NO_RULE_SUMMARIES
    },
    joins: (edition) => {
      const joins = new Map<string, VsDataJoin>()
      const version = versions.find((candidate) => candidate.edition === edition)
      for (const file of version?.files ?? [])
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
  const held: RuleSummarySpan[] = spans.flatMap(({ start, end, bold, target }) => {
    const to = target && link(target)
    const ability = target && abilities.has(vsDataKey(target)) ? vsDataKey(target) : undefined
    return bold || to || ability
      ? [{ start, end, ...(bold ? { bold } : {}), ...(to ? { link: to } : {}), ...(ability ? { ability } : {}) }]
      : []
  })
  // A summary prints a weapon ability in brackets, as the cards do, often without a span naming it.
  for (const match of summary.matchAll(/\[([^[\]]+)\]/g)) {
    const ability = bracketedAbility(match[1]!, abilities)
    const start = match.index
    const end = start + match[0].length
    const same = held.find((span) => span.start === start && span.end === end)
    if (!ability || same?.ability) continue
    if (same) same.ability = ability
    else if (!held.some((span) => span.start < end && start < span.end)) held.push({ start, end, ability })
  }
  return { summary, spans: held.toSorted((left, right) => left.start - right.start), questions }
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
 * Removes each summary that repeats, as a whole or in a sentence, a string of any of the source files, and names what
 * it removed. A file several rules versions hold is read once.
 */
function* withoutOriginalWording(versions: readonly Version[]): Steps<string[]> {
  const byWording = new Map<string, { version: Version; id: string }[]>()
  for (const version of versions)
    for (const [id, { summary }] of version.summaries)
      for (const wording of wordingsOf(summary)) remember(byWording, wording, () => []).push({ version, id })
  const withheld = new Map<string, { version: Version; id: string }>()
  const files = new Map(versions.flatMap((version) => version.files.map((file) => [file.id, file.path])))
  for (const file of files.values()) {
    for (const text of sourceStrings(readJson(file)))
      for (const wording of wordingsOf(text))
        for (const found of byWording.get(wording) ?? []) withheld.set(`${found.version.edition} ${found.id}`, found)
    yield
  }
  for (const { version, id } of withheld.values()) version.summaries.delete(id)
  return [...withheld.keys()].toSorted()
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
