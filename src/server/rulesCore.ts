import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { english } from './missionPacks'

/**
 * The rules documents the datacards source ships beside its cards: the core rules
 * themselves, Chapter Approved, the event companion, Combat Patrol and the Legends
 * appendix.
 *
 * Every one of them is written in the same format — sections of numbered entries,
 * each entry a run of prose, headings and collapsible clarifications — so whatever
 * documents the snapshot's `core` directory holds are read, rather than five names
 * being written down here. A file that does not declare itself a rules document is
 * skipped, a field the format does not describe is left out, and the numbers the
 * source prints are the only rule references, so nothing on these pages is this
 * app's paraphrase of a rule.
 *
 * The pictures are the printed rulebook's own photography and are not republished,
 * which is the one thing these pages leave out of what the source carries.
 */
const RULES_CARD_TYPE = 'coreRules'

/** Read first, because it is the document the other four amend. */
const CORE_RULES_SLUG = 'core-rules'

export type RuleBlock =
  | { kind: 'prose'; markup: string }
  | { kind: 'heading'; text: string }
  | { kind: 'clarification'; code: string | null; anchor: string | null; title: string; markup: string }

/** One labelled field of a movement behaviour or core stratagem, as the source labels it. */
export type RuleFact = { label: string; markup: string }

export type RuleEntry = {
  id: string
  /** The number the source prints against this rule, such as `09.04`. */
  code: string | null
  /** Where the rule sits on its section's page, and what a reference to it links to. */
  anchor: string
  title: string
  blocks: RuleBlock[]
  facts: RuleFact[]
  cost: number | null
  lore: string | null
}

export type RuleSection = { id: string; slug: string; title: string; entries: RuleEntry[] }
export type RuleDocument = { id: string; slug: string; title: string; updated: string | null; sections: RuleSection[] }

export type RuleEntrySummary = { anchor: string; code: string | null; title: string }
export type RuleSectionSummary = { id: string; slug: string; title: string; entries: RuleEntrySummary[] }
export type RuleDocumentSummary = { id: string; slug: string; title: string; updated: string | null; sections: RuleSectionSummary[] }
/** Where the number one rule quotes in another is written down, so prose can link to it. */
export type RuleReference = { code: string; document: string; section: string; anchor: string; title: string }
export type RuleIndex = { documents: RuleDocumentSummary[]; references: RuleReference[]; attribution: string }

/** What a stratagem and a movement behaviour each state, in the order they state it. */
const STRATAGEM_FACTS = ['when', 'target', 'effect', 'restrictions']
const BEHAVIOUR_FACTS = [
  'eligibleIf',
  'beforeMoving',
  'whileMoving',
  'afterMoving',
  'whileShooting',
  'afterShooting',
  'setupDistance',
  'maximumDistance',
  'effect',
]
const NON_FACT_FIELDS = new Set(['id', 'name', 'ruleReference', 'cost', 'lore'])

export function loadRuleDocuments(datacardsDirectory: string): RuleDocument[] {
  const directory = path.join(datacardsDirectory, 'core')
  if (!fs.existsSync(directory)) return []
  const documents = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .toSorted()
    .flatMap((name) => readDocument(path.join(directory, name)))
  return documents.toSorted((left, right) => Number(right.slug === CORE_RULES_SLUG) - Number(left.slug === CORE_RULES_SLUG))
}

function readDocument(file: string): RuleDocument[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!parsed || typeof parsed !== 'object') return []
  const document = parsed as Record<string, unknown>
  const title = english(document.name)
  if (document.cardType !== RULES_CARD_TYPE || typeof document.id !== 'string' || !title) return []
  const sections = withAnchors(withSlugs(ordered(document.sections).flatMap(readSection)))
  if (!sections.length) return []
  return [{ id: document.id, slug: routeSlug(title), title, updated: english(document.updated), sections }]
}

type Unslugged = Omit<RuleSection, 'slug'>

function readSection(section: Record<string, unknown>): Unslugged[] {
  const title = english(section.name)
  if (typeof section.id !== 'string' || !title) return []
  const entries = ordered(section.containers).flatMap(readEntry)
  return entries.length ? [{ id: section.id, title, entries }] : []
}

/**
 * A section is addressed by its name without the number it is printed under, and by
 * the numbered name where two sections would otherwise answer to one address.
 */
function withSlugs(sections: Unslugged[]): RuleSection[] {
  const taken = new Set<string>()
  return sections.map((section) => {
    const preferred = routeSlug(section.title.replace(/^\d+[.)]\s*/, ''))
    const slug = preferred && !taken.has(preferred) ? preferred : routeSlug(section.title)
    taken.add(slug)
    return { ...section, slug }
  })
}

/**
 * One page holds a whole section, so every rule and clarification on it needs an
 * address of its own. The number the source prints is that address, and the second
 * rule to print a number it has already used is numbered off it.
 */
function withAnchors(sections: RuleSection[]): RuleSection[] {
  const taken = new Set<string>()
  const claim = (preferred: string) => {
    let anchor = preferred
    for (let attempt = 2; taken.has(anchor); attempt += 1) anchor = `${preferred}-${attempt}`
    taken.add(anchor)
    return anchor
  }
  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => ({
      ...entry,
      anchor: claim(entry.anchor),
      blocks: entry.blocks.map((block) =>
        block.kind === 'clarification' && block.anchor ? { ...block, anchor: claim(block.anchor) } : block,
      ),
    })),
  }))
}

function readEntry(container: Record<string, unknown>): RuleEntry[] {
  const title = english(container.title)
  if (typeof container.id !== 'string' || !title) return []
  const stratagem = fieldsOf(container.stratagem)
  const behaviour = fieldsOf(container.behaviour)
  const source = stratagem ?? behaviour
  const cost = stratagem?.cost
  const code = english(container.subTitle) ?? english(behaviour?.ruleReference)
  return [
    {
      id: container.id,
      code,
      // Read as the rule where the source numbers it, so a link says which rule it is.
      anchor: code ?? container.id,
      title,
      blocks: ordered(container.components).flatMap(readBlock),
      facts: stratagem ? facts(stratagem, STRATAGEM_FACTS) : behaviour ? facts(behaviour, BEHAVIOUR_FACTS) : [],
      cost: typeof cost === 'number' ? cost : null,
      lore: stated(english(source?.lore)),
    },
  ]
}

function readBlock(component: Record<string, unknown>): RuleBlock[] {
  const text = english(component.text)
  switch (component.type) {
    case 'text':
      return text ? [{ kind: 'prose', markup: text }] : []
    case 'header':
      return text ? [{ kind: 'heading', text }] : []
    case 'accordion': {
      const title = english(component.title)
      if (!title || !text) return []
      // A clarification is titled with its own number, one level below the entry's.
      const [, code, name] = /^(\d+(?:\.\d+)+)\s*[-–—]\s*(.+)$/.exec(title) ?? []
      return [{ kind: 'clarification', code: code ?? null, anchor: code ?? null, title: name ?? title, markup: text }]
    }
    default:
      return []
  }
}

/**
 * Every field the source states, labelled by the name it gives it.
 *
 * The order it prints them in comes first and anything it adds later follows, so a
 * field this app has never heard of reaches the page rather than disappearing.
 */
function facts(fields: Record<string, unknown>, preferred: readonly string[]): RuleFact[] {
  const keys = [...preferred.filter((key) => key in fields), ...Object.keys(fields).filter((key) => !preferred.includes(key))]
  return keys.flatMap((key) => {
    const markup = NON_FACT_FIELDS.has(key) ? null : stated(english(fields[key]))
    return markup ? [{ label: factLabel(key), markup }] : []
  })
}

/** `afterMoving` is what the source calls it; `After moving` is what a player reads. */
const factLabel = (key: string) => {
  const words = key.replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2').toLocaleLowerCase()
  return `${words.slice(0, 1).toLocaleUpperCase()}${words.slice(1)}`
}

/** The source writes a field it has nothing to say in as a dash, which is not a rule. */
const stated = (value: string | null | undefined) => (value && /[\p{L}\p{N}]/u.test(value) ? value : null)

const fieldsOf = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/** In the order the source numbers them, and in the order it lists them where it does not. */
function ordered(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((entry: unknown) => {
      const fields = fieldsOf(entry)
      return fields ? [fields] : []
    })
    .map((entry, index) => ({ entry, rank: typeof entry.order === 'number' ? entry.order : index }))
    .toSorted((left, right) => left.rank - right.rank)
    .map(({ entry }) => entry)
}

/**
 * Every document and section by name, with the rule numbers each page answers to.
 *
 * Small enough to load with any rules page, which is what lets a rule that quotes
 * `(10.05)` link straight to it without the reader's page holding all five
 * documents. Numbers belong to the document that prints them — Combat Patrol has an
 * `01.03` of its own — so they are collected per document and read that way.
 *
 * Built once per snapshot, because every rules page asks for it.
 */
export function ruleIndexOf(documents: readonly RuleDocument[]): RuleIndex {
  const cached = indexes.get(documents)
  if (cached) return cached
  const index = buildRuleIndex(documents)
  indexes.set(documents, index)
  return index
}

const indexes = new WeakMap<readonly RuleDocument[], RuleIndex>()

function buildRuleIndex(documents: readonly RuleDocument[]): RuleIndex {
  const references: RuleReference[] = []
  const summaries = documents.map((document) => {
    const claimed = new Set<string>()
    return {
      id: document.id,
      slug: document.slug,
      title: document.title,
      updated: document.updated,
      sections: document.sections.map((section) => ({
        id: section.id,
        slug: section.slug,
        title: section.title,
        entries: section.entries.map((entry) => {
          for (const { code, anchor, title } of numbersIn(entry)) {
            if (claimed.has(code)) continue
            claimed.add(code)
            references.push({ code, title, anchor, document: document.slug, section: section.slug })
          }
          return { anchor: entry.anchor, code: entry.code, title: entry.title }
        }),
      })),
    }
  })
  return { documents: summaries, references, attribution: DATACARDS_ATTRIBUTION }
}

/** The entry's own number, then each clarification numbered beneath it. */
const numbersIn = (entry: RuleEntry) => [
  ...(entry.code ? [{ code: entry.code, anchor: entry.anchor, title: entry.title }] : []),
  ...entry.blocks.flatMap((block) =>
    block.kind === 'clarification' && block.code && block.anchor ? [{ code: block.code, anchor: block.anchor, title: block.title }] : [],
  ),
]

export function ruleSectionOf(documents: readonly RuleDocument[], documentSlug: string, sectionSlug: string) {
  const document = documents.find((candidate) => candidate.slug === documentSlug)
  const section = document?.sections.find((candidate) => candidate.slug === sectionSlug)
  return document && section ? { document: { slug: document.slug, title: document.title }, section } : null
}
