import { routeSlug } from '../core/slug'
import { capitalised } from '../core/text'
import type { RuleBlock, RuleDocument, RuleEntry, RuleFact, RuleSection, RuleTextSource } from '../contracts/rules'
import { english } from './datacards'

/** Read every declared core rules document from the source and use only its printed rule numbers; omit the printed rulebook’s photography. */
const RULES_CARD_TYPE = 'coreRules'

/** Read first, because it is the document the other four amend. */
const CORE_RULES_SLUG = 'core-rules'

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

export const coreRulesFirst = <T extends { slug: string }>(documents: readonly T[]) =>
  documents.toSorted((left, right) => Number(right.slug === CORE_RULES_SLUG) - Number(left.slug === CORE_RULES_SLUG))

/**
 * One parsed source file as a rules document, or null for a file that is not one.
 *
 * The server and a reader's browser both read the same pinned file through this, which
 * is what lets the browser's text land on the addresses the server's outline gives.
 */
export function ruleDocumentFrom(parsed: unknown, text: RuleTextSource | null = null): RuleDocument | null {
  const document = fieldsOf(parsed)
  const title = english(document?.name)
  if (!document || document.cardType !== RULES_CARD_TYPE || typeof document.id !== 'string' || !title) return null
  const sections = withAnchors(withSlugs(ordered(document.sections).flatMap(readSection)))
  if (!sections.length) return null
  return { id: document.id, slug: routeSlug(title), title, updated: english(document.updated), text, sections }
}

/**
 * What the server publishes of a document: its titles, numbers, costs, and addresses,
 * without the publisher's text, which a reader's browser loads from `text` instead.
 */
export function ruleOutline<T extends RuleDocument>(document: T): T {
  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => ({
        ...entry,
        blocks: entry.blocks.flatMap((block): RuleBlock[] => {
          if (block.kind === 'prose') return []
          return block.kind === 'clarification' ? [{ ...block, markup: null }] : [block]
        }),
        facts: [],
        lore: null,
      })),
    })),
  }
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
const factLabel = (key: string) => capitalised(key.replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase())

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
