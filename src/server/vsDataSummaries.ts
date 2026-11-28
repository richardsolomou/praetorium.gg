import fs from 'node:fs'
import path from 'node:path'
import { RecentlyUsed, remember } from '../core/collections'
import { routeSlug } from '../core/slug'
import { sourceStrings } from '../core/sourceText'
import {
  MISSION_SUMMARIES,
  RULE_SUMMARIES,
  type RuleDocument,
  type RuleSummaries,
  type RuleSummary,
  type RuleSummaryInline,
  type RuleSummaryLink,
  type RuleSummaryParts,
} from '../contracts/rules'
import { spannedParagraph, type SummaryBlock, type SummaryInline, summaryBlocks, summaryText } from '../core/summaryMarkdown'
import type { Steps } from '../shared/steps'
import { idsIn } from '../shared/vsDataPoints'
import {
  type BsdataRecords,
  type GdcRuleKind,
  gdcRuleRecords,
  vsDataIndex,
  vsDataKey,
  type VsDataAttribution,
  type VsDataSummariesFile,
  type VsDataUnits,
  vsDataSummariesSchema,
} from '../shared/vsData'
import { bsdataRecordsIn } from './bsdataRecords'
import { readCatalogueComposition } from './catalogueComposition'
import { editionTextFiles, textHash } from './sourceTexts'
import { legacyUnitIds } from './vsDataPoints'

/** An alias naming a VS Data id, rather than another source's, such as `bsdata.` or `gdc.`. */
const isVsDataId = (alias: string) => !/^(bsdata|gdc)\./.test(alias)

export const NO_RULE_SUMMARIES: RuleSummaries = { records: {}, texts: {}, entries: {} }

/**
 * The ability each BSData profile is, by its id, or by `<datasheet>/<id>` where it is another on each datasheet; a
 * datasheet whose own record is no ability, as a core keyword, keeps an empty one, never the id's, and one whose record
 * the rules version lacks reads the id's, as a bare frozen key reaches every version.
 */
export function abilityAliases(records: BsdataRecords, summarized: (key: string) => boolean): Record<string, string> {
  const ability = (key: string) => (key.startsWith('ability:') && summarized(key) ? key.slice('ability:'.length) : undefined)
  return {
    ...Object.fromEntries(Object.entries(records.byId).flatMap(([id, key]) => (ability(key) ? [[id, ability(key)!] as const] : []))),
    ...Object.fromEntries(
      Object.entries(records.bySheet).flatMap(([sheet, key]) => (summarized(key) ? [[sheet, ability(key) ?? ''] as const] : [])),
    ),
  }
}

/**
 * One source file's summaries, by its token ID, or the mission pack's; for an ID no file of the snapshot has, word that a
 * data update replaced it, as a token kept from before one names, so its strings are looked up where they live now.
 */
export const summariesOfFile = (file: string, files: Readonly<Record<string, unknown>>, summaries: VsDataSummaries | null | undefined) =>
  file in files || file === MISSION_SUMMARIES || file === RULE_SUMMARIES
    ? (summaries?.summariesIn(file) ?? NO_RULE_SUMMARIES)
    : { ...NO_RULE_SUMMARIES, replaced: true as const }

/** One Game Datacards record of a summarized rules version: whether VS Data names it, and whether its summary is served. */
export type VsDataJoin = { kind: GdcRuleKind; key: string; named: boolean; served: boolean }

export type VsDataSummaries = {
  /** The rules versions the pinned releases describe, the base first. */
  editions: string[]
  /**
   * The summaries for the rules one Game Datacards file prints, by the file's token ID, read for its rules version;
   * or, for `MISSION_SUMMARIES` and `RULE_SUMMARIES`, the current rules' mission or rules-document records by `kind:id`.
   */
  summariesIn: (file: string) => RuleSummaries
  /** Every Game Datacards record of one rules version, once each, for the coverage report. */
  joins: (edition: string) => VsDataJoin[]
  /**
   * The current rules version's summaries of the weapon and core abilities, by `kind:id`, which a keyword's tooltip
   * and a summary naming the ability show.
   */
  abilities: () => Record<string, RuleSummary>
  /**
   * The current rules version's summaries of the whole core rules, not their parts, by `kind:id`, one of which a granted
   * ability's chip, such as Benefit of Cover, may name where no ability summary does.
   */
  coreRules: () => Record<string, RuleSummary>
  /** The upstream work the served summaries adapt, once each, which the Sources page credits. */
  attributions: () => VsDataAttribution[]
  /** What datasheets show from VS Data for a rules version (the current one where null); none for one it has no release of. */
  unitsIn: (edition: string | null) => VsDataUnits
  /** The same, with each ability as its record's `kind:id`; none for a rules version it has no release of. */
  recordsIn: (edition: string | null) => VsDataRecords | null
}

type Version = {
  edition: string
  index: ReturnType<typeof vsDataIndex>
  summaries: Map<string, RuleSummary>
  units: VsDataUnits
  records: VsDataRecords
}

/** A release's units with each ability as the `kind:id` of the record whose summary datasheets show for it. */
export type VsDataRecords = Omit<VsDataUnits, 'abilities'> & { abilities: Record<string, string> }

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
  const releaseOf = (entry: (typeof order)[number]) => entry.summaries ?? entry.edition.id
  const held = order.filter((entry) => fs.existsSync(path.join(folder, `${releaseOf(entry)}.json`)))
  const baseOf = (edition: string) => held.find((candidate) => candidate.edition.id === edition)?.base
  if (!held.length) return null
  const release = (edition: string) => {
    const entry = held.find((candidate) => candidate.edition.id === edition)
    const parsed = entry && vsDataSummariesSchema.safeParse(readJson(path.join(folder, `${releaseOf(entry)}.json`)))
    return parsed && parsed.success ? parsed.data : null
  }
  const links = ruleLinks(documents)
  const versions = new Map<string, Version | null>()
  const versionOf = (edition: string) =>
    remember(versions, edition, () => {
      const file = release(edition)
      if (!file) return null
      const index = vsDataIndex(file.entries)
      // A weapon or core ability has no rules entry of its own, so it links to the core rule of its id that prints it.
      const link = (target: { kind: string; id: string }) =>
        target.kind === 'core-rule' || ABILITY_KINDS.includes(target.kind) ? links.get(target.id) : undefined
      const abilities = new Set(file.records.flatMap((record) => (ABILITY_KINDS.includes(record.kind) ? [vsDataKey(record)] : [])))
      const summaries = new Map(file.records.map((record) => [vsDataKey(record), summaryOf(record, link, abilities)]))
      const abilitySummaries = [...summaries].filter(([key]) => key.startsWith('ability:'))
      const bsdata = bsdataRecordsIn(file.entries, baseOf(edition) ? null : edition)
      // Every ability by its VS Data id, which a unit's own abilities and its faction's start with, and by each former
      // VS Data id it is aliased under, as Cogbound Alliance is by the Mechanicus Allies the detachment prints.
      const abilitiesBy = <T>(value: (ability: (typeof abilitySummaries)[number]) => T) =>
        Object.fromEntries([
          ...abilitySummaries.flatMap((ability) =>
            (file.entries[ability[0]] ?? []).filter(isVsDataId).map((id) => [id, value(ability)] as const),
          ),
          // Last, so an ability's own id wins over another's former one.
          ...abilitySummaries.map((ability) => [ability[0].slice('ability:'.length), value(ability)] as const),
        ])
      const servedUnit = (id: string, unit: (typeof file.units)[string]) => ({
        ...unit,
        id,
        ...(unit.invulnerableSaves
          ? {
              invulnerableSaves: unit.invulnerableSaves.map((save) => {
                const summary = save.condition ? summaries.get(`unit-profile:${save.condition}`) : undefined
                return summary ? { ...save, summary } : save
              }),
            }
          : {}),
      })
      // A unit's BSData aliases name its entry id with dots for dashes; a datasheet one book reads as another unit, as a
      // chaos book's Library Titan, keeps that unit under `<book>/<datasheet>` (`unitsInBook`).
      const units = {
        units: Object.fromEntries([
          ...Object.entries(file.units).flatMap(([id, unit]) =>
            index
              .aliasesOf({ kind: 'unit', id })
              .filter((alias) => alias.startsWith('bsdata.'))
              .map((alias) => [alias.slice('bsdata.'.length).replaceAll('.', '-'), servedUnit(id, unit)] as const),
          ),
          ...[...idsIn(legacyUnitIds, baseOf(edition) ? null : edition)].flatMap(([key, id]) => {
            const unit = key.includes('/') ? file.units[id] : undefined
            return unit ? [[key, servedUnit(id, unit)] as const] : []
          }),
        ]),
        abilities: abilitiesBy(([, summary]) => summary),
        aliases: abilityAliases(bsdata, (key) => summaries.has(key)),
        // A faction a catalogue names as VS Data does but under another id, as its Adeptus Titanicus is `titan-legions`;
        // a name that is itself an id, as Aeldari is, stays that faction's.
        factions: Object.fromEntries(
          Object.entries(file.factions).flatMap(([name, id]) =>
            routeSlug(name) === id || Object.values(file.factions).includes(routeSlug(name)) ? [] : [[routeSlug(name), id] as const],
          ),
        ),
      }
      return { edition, index, units, records: { ...units, abilities: abilitiesBy(([key]) => key) }, summaries }
    })
  const filesOf = (entry: (typeof held)[number]) => editionTextFiles(directory, entry.base ? null : entry.edition.id)
  const cards = new Map<string, { file: string; edition: string }>()
  for (const entry of held)
    for (const file of filesOf(entry))
      if (file.source === 'game-datacards' && !cards.has(file.id)) cards.set(file.id, { file: file.path, edition: entry.edition.id })
  yield
  const read = (file: string) => gdcRuleRecords(readJson(file))
  // Game Datacards prints every FAQ in a rules version's `faqs.json`.
  const faqs = new Map<string, ReadonlyMap<string, string[]>>()
  const faqsByText = (edition: string) =>
    remember(faqs, edition, () => {
      const byText = new Map<string, string[]>()
      for (const file of filesOf(held.find((entry) => entry.edition.id === edition)!))
        if (file.source === 'game-datacards' && path.basename(file.path) === 'faqs.json')
          for (const record of read(file.path))
            if (record.kind === 'FAQ') for (const text of record.texts) byText.set(textHash(text), record.keys)
      return byText
    })
  // A clarification the core rules print in an FAQ's own words is that FAQ, which VS Data names.
  const recordsIn = (file: string, edition: string) =>
    read(file).map((record) =>
      record.kind === 'core rule clarification'
        ? { ...record, keys: [...record.keys, ...record.texts.flatMap((text) => faqsByText(edition).get(textHash(text)) ?? [])] }
        : record,
    )
  const answers = new RecentlyUsed<string, RuleSummaries>(16)
  return {
    editions: held.map((entry) => entry.edition.id),
    abilities: () =>
      Object.fromEntries(
        [...(versionOf(held[0]!.edition.id)?.summaries ?? [])].filter(([key]) => ABILITY_KINDS.some((kind) => key.startsWith(`${kind}:`))),
      ),
    coreRules: () =>
      Object.fromEntries(
        [...(versionOf(held[0]!.edition.id)?.summaries ?? [])].filter(([key]) => key.startsWith('core-rule:') && !key.includes('.')),
      ),
    // Read without keeping the versions, as only the Sources page asks.
    attributions: () => [
      ...new Map(
        held
          .flatMap((entry) => release(entry.edition.id)?.attributions ?? [])
          .map((credit) => [`${credit.credit} ${credit.licence}`, credit]),
      ).values(),
    ],
    unitsIn: (edition) => {
      const id = edition ?? held[0]!.edition.id
      return (held.some((entry) => entry.edition.id === id) && versionOf(id)?.units) || { units: {}, abilities: {}, aliases: {} }
    },
    recordsIn: (edition) => {
      const id = edition ?? held[0]!.edition.id
      return (held.some((entry) => entry.edition.id === id) && versionOf(id)?.records) || null
    },
    summariesIn: (id) => {
      if (id === MISSION_SUMMARIES || id === RULE_SUMMARIES) {
        const version = versionOf(held[0]!.edition.id)
        const kinds = id === MISSION_SUMMARIES ? MISSION_KINDS : ['core-rule:']
        return version ? remember(answers, id, () => summariesOfKinds(version.summaries, kinds)) : NO_RULE_SUMMARIES
      }
      const card = cards.get(id)
      const version = card && versionOf(card.edition)
      return card && version
        ? remember(answers, id, () => summariesFor(recordsIn(card.file, card.edition), version.index, version.summaries))
        : NO_RULE_SUMMARIES
    },
    joins: (edition) => {
      const joins = new Map<string, VsDataJoin>()
      const entry = held.find((candidate) => candidate.edition.id === edition)
      const version = entry && versionOf(edition)
      for (const file of entry && version ? filesOf(entry) : [])
        if (file.source === 'game-datacards')
          for (const { kind, keys } of recordsIn(file.path, edition)) {
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

function summariesOfKinds(summaries: ReadonlyMap<string, RuleSummary>, kinds: readonly string[]): RuleSummaries {
  const records = [...summaries].filter(([key]) => kinds.some((kind) => key.startsWith(kind)))
  return { records: Object.fromEntries(records), texts: {}, entries: {} }
}

/**
 * The compacted VS Data release a rules version reads, the base rules version's by default, or that of the rules
 * version VS Data folded it into, or null where the snapshot holds none for it.
 */
export function readVsDataRelease(directory: string, edition?: string): VsDataSummariesFile | null {
  const entry = readCatalogueComposition(directory)?.editions.find((candidate) =>
    edition ? candidate.edition.id === edition : candidate.base,
  )
  const id = entry?.summaries ?? entry?.edition.id ?? edition
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
  { summary, spans, questions, parts }: VsDataSummariesFile['records'][number],
  link: (target: { kind: string; id: string }) => RuleSummaryLink | undefined,
  abilities: ReadonlySet<string>,
): RuleSummary {
  const runs = (inlines: SummaryInline[]) => inlines.flatMap((inline) => served(inline, link, abilities))
  const shown = (blocks: SummaryBlock[]) =>
    blocks.map((block) =>
      'paragraph' in block ? { paragraph: runs(block.paragraph) } : { list: block.list, items: block.items.map(runs) },
    )
  if (!parts) return { blocks: shown(spans.length ? [spannedParagraph(summary, spans)] : summaryBlocks(summary)), questions }
  const shownParts: RuleSummaryParts = {
    when: shown(summaryBlocks(parts.when)),
    target: shown(summaryBlocks(parts.target)),
    effect: shown(summaryBlocks(parts.effect)),
    ...(parts.restrictions ? { restrictions: shown(summaryBlocks(parts.restrictions)) } : {}),
  }
  return { parts: shownParts, questions }
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
    // A run naming a weapon or core ability, linked to that ability's core rule instead, still opens the ability.
    const ability = abilities.has(vsDataKey(target)) ? vsDataKey(target) : bracketedAbility(text.replace(/^\[|\]$/g, ''), abilities)
    return [{ text, ...emphasis, ...(to ? { link: to } : {}), ...(ability ? { ability } : {}) }]
  }
  const runs: RuleSummaryInline[] = []
  let read = 0
  for (const match of text.matchAll(/\[([^[\]]+)\]/g)) {
    const ability = bracketedAbility(match[1]!, abilities)
    if (!ability) continue
    if (match.index > read) runs.push({ text: text.slice(read, match.index), ...emphasis })
    const [kind, id] = ability.split(':') as [string, string]
    const to = link({ kind, id })
    runs.push({ text: match[0], ...emphasis, ...(to ? { link: to } : {}), ability })
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

/** Each rules-document rule's and clarification's page and anchor, by its VS Data id. */
function ruleLinks(documents: readonly RuleDocument[]) {
  const links = new Map<string, RuleSummaryLink>()
  for (const document of documents)
    for (const section of document.sections)
      for (const entry of section.entries)
        for (const { id, anchor } of [entry, ...entry.clarifications])
          if (!links.has(id)) links.set(id, { document: document.slug, section: section.slug, anchor })
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
