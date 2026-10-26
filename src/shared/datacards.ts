import { withoutFactionPrefix } from '../core/name'
import { canonicalDetachmentName } from '../core/detachmentName'
import { remember, uniqueBy } from '../core/collections'
import { PHASES, type Stratagem } from '../core/battle'
import { routeSlug } from '../core/slug'
import { catalogueFactionName } from './factionNames'
import { joinKey } from '../core/text'
import type { SourceTexts, TextTransform } from './sourceText'
import type { TextFactsByKey } from './textFacts'
import { type PrintedTransport, printedTransport } from '../core/transport'
/**
 * What Game Datacards says: the shape of each datasheet, and every piece of rules
 * prose the app shows — army rules, detachment rules, enhancements and stratagems.
 *
 * One file per faction, keyed here by the faction as the catalogues name it as well
 * as by its own name, so the Adeptus Astartes file answers for the Space Marines book.
 * Prose is keyed by the detachment and the name a card prints, which is also how the
 * rules dataset names them; a name the files describe two ways is left blank rather
 * than guessed between.
 */
export const DATACARDS_ATTRIBUTION = 'Data provided by game-datacards'
export type DatasheetDetails = {
  composition: string[]
  loadout: string | null
  wargear: string[]
  wargearGroups?: { instruction: string; options: string[] }[]
  baseSize: string | null
  transport: string | null
  /** How many models the composition prints, read before its lines are published only as tokens. */
  modelCount?: string
  /** What the transport text states, read before the text is published only as a token. */
  transportCapacity?: PrintedTransport
  points: { models: string; cost: string; keyword: string | null; faction: string | null; detachment: string | null }[]
  attachesTo: { kind: 'leader' | 'support'; name: string }[]
  leaders: string[]
  supporters: string[]
}
export type RuleCard = { name: string; description: string }
/**
 * What a section the cards name and leave empty actually says, by title.
 *
 * The files write the Aeldari Agile Manoeuvres as six titles with no words at all, so
 * the card is asking for prose it does not carry. `entry` is the name the section is
 * asking under — the card and the section it headed, as the catalogue names the entry
 * holding them — and a title nothing answers for keeps its heading and nothing beneath
 * it. `catalogueSections` is the only thing that can answer, because those words are in
 * the community catalogue rather than here.
 */
export type SectionProse = (section: { faction: string; entry: string; titles: readonly string[] }) => ReadonlyMap<string, string>
export type ConstructionDetachment = {
  name: string
  faction: string
  points: number | null
  pointOverrides: ReadonlyMap<string, number | null>
  dispositions: string[]
  globallyValid: boolean
}
type ConstructionEnhancement = {
  ids?: readonly string[]
  name: string
  detachment: string
  points: number | null
  description: string | null
  eligibility: EnhancementEligibility | null
}
import type { EnhancementEligibility } from '../contracts/factions'
export type { EnhancementEligibility } from '../contracts/factions'
type FactionStratagem = {
  id: string
  name: string
  cp: number
  limit: Stratagem['limit']
  phases: NonNullable<Stratagem['phases']> | null
  turn: NonNullable<Stratagem['turn']> | null
  type: string | null
  description: string
}
export type FactionContent = {
  name: string
  attribution?: string
  parentName?: string | null
  datasheets: Set<string>
  datasheetDetails: Map<string, DatasheetDetails>
  datasheetIds: ReadonlyMap<string, DatasheetDetails>
  detachments: Set<string>
  detachmentFactions?: ReadonlyMap<string, string>
  /** Unambiguous cards by their detachment's accent- and spacing-insensitive join key. */
  enhancements: ReadonlyMap<string, readonly ConstructionEnhancement[]>
  stratagems: ReadonlyMap<string, readonly FactionStratagem[]>
  stratagemIssues: readonly string[]
  detachmentRules: ReadonlyMap<string, readonly RuleCard[]>
  armyRules: RuleCard[]
  /** The army rules its datasheets print by name, whether or not the file carries the card. */
  factionAbilityNames: Set<string>
  /** Units and keywords the army rules refuse, read from their words before those are published only as tokens. */
  restrictions: readonly FactionRestriction[]
  /** Every unit an army rule lists as refused, so a list the restrictions did not read is reported. */
  restrictionLists: readonly { faction: string; names: readonly string[] }[]
}
type FactionRestriction = {
  owner: string
  excludedNames: readonly (readonly [string, string | null])[]
  excludedKeywords: readonly string[]
}
export type LoadedDatacards = {
  keywordRules?: readonly RuleCard[]
  /** By the slug of every name a faction answers to. */
  factions: Map<string, FactionContent>
  /** By detachment slug. */
  detachmentRules: ReadonlyMap<string, readonly RuleCard[]>
  /** By `descriptionKey`. */
  enhancements: ReadonlyMap<string, string>
  /** By `descriptionKey`, carrying the name as the card prints it: the rules dataset shouts. */
  stratagems: ReadonlyMap<string, RuleCard>
  stratagemsById: ReadonlyMap<string, RuleCard>
  /** Every army rule by its slug, where the files agree on what it says. */
  armyRules: ReadonlyMap<string, string>
  /** By detachment slug, retaining every exact-name candidate so conflicts fail closed. */
  constructionDetachments: ReadonlyMap<string, readonly ConstructionDetachment[]>
  /** By `descriptionKey`, where every matching card agrees on the points. */
  enhancementPoints: ReadonlyMap<string, number>
  /** What the roster rules read from each published text, by `textKey`. */
  textFacts?: TextFactsByKey
}
export type FactionRestrictions = {
  /** Lowercased datasheet names, each with the lowercased keyword that exempts a unit from it, if any. */
  excludedNames: ReadonlyMap<string, string | null>
  excludedKeywords: ReadonlySet<string>
}
export type DatacardsFaction = {
  attribution?: unknown
  id?: unknown
  name?: unknown
  parent_name?: unknown
  datasheets?: unknown
  detachments?: unknown
  rules?: unknown
  enhancements?: unknown
  stratagems?: unknown
}
/** A card's name as every source spells it: `(Aura)` and `(Upgrade)` are printed by some and not others. */
export const cardName = (name: string) => routeSlug(name).replaceAll(/-(?:aura|upgrade)(?=-|$)/g, '')
/** The faction-scoped construction join, folding accents and optional card-kind suffixes. */
export const constructionCardKey = (name: string) => joinKey(name.replace(/(?:\s*\((?:aura|upgrade)\))+\s*$/i, ''))
/** A card names its detachment and itself. */
export const descriptionKey = (detachment: string, name: string) => `${routeSlug(canonicalDetachmentName(detachment))}|${cardName(name)}`
/** The source's own faction name and the catalogue name already declared for it. */
export const datacardsFactionKeys = (name: string) => new Set([routeSlug(name), routeSlug(catalogueFactionName(name))])
export function constructionDetachment(
  datacards: LoadedDatacards,
  faction: string,
  detachment: string,
  parentFaction: string | null = null,
) {
  const candidates = datacards.constructionDetachments.get(routeSlug(canonicalDetachmentName(detachment))) ?? []
  const matches = (candidate: ConstructionDetachment, wanted: string) => datacardsFactionKeys(candidate.faction).has(routeSlug(wanted))
  const exact = candidates.filter((candidate) => matches(candidate, faction))
  const parent = parentFaction ? candidates.filter((candidate) => matches(candidate, parentFaction)) : []
  const relevant = exact.length ? exact : parent
  const answers = new Map(
    relevant.map((candidate) => {
      const factionKey = routeSlug(faction)
      const answer = candidate.globallyValid
        ? {
            points: candidate.pointOverrides.has(factionKey) ? candidate.pointOverrides.get(factionKey)! : candidate.points,
            dispositions: candidate.dispositions,
          }
        : { points: null, dispositions: [] }
      return [JSON.stringify(answer), answer]
    }),
  )
  if (answers.size !== 1) return null
  const answer = answers.values().next().value!
  return answer.points === null || !answer.dispositions.length ? null : { points: answer.points, dispositions: answer.dispositions }
}
function cardPhases(value: unknown): NonNullable<Stratagem['phases']> | null {
  if (!Array.isArray(value) || !value.length) return null
  const allowed = new Set<string>([...PHASES, 'any'])
  if (!value.every((phase) => typeof phase === 'string' && allowed.has(phase))) return null
  if (value.includes('any')) return value.length === 1 ? [] : null
  return [...new Set(value)] as NonNullable<Stratagem['phases']>
}
function phaseFromWhen(value: string | null): NonNullable<Stratagem['phases']> | null {
  const phases = [...(value?.matchAll(/\b(command|movement|shooting|charge|fight|end) phase\b/gi) ?? [])].map((match) =>
    match[1]!.toLowerCase(),
  )
  return phases.length === 1 ? (phases as NonNullable<Stratagem['phases']>) : null
}
function cardTurn(value: unknown): NonNullable<Stratagem['turn']> | null {
  if (value === 'your') return 'your-turn'
  if (value === 'opponents') return 'opponent-turn'
  if (value === 'either') return 'either'
  return null
}
export const enhancementPoints = (datacards: LoadedDatacards, detachment: string, enhancement: string) =>
  datacards.enhancementPoints.get(descriptionKey(detachment, enhancement)) ?? null
export function factionContent(
  name: string,
  parsed: DatacardsFaction,
  sections: SectionProse,
  datasheetNames: readonly string[],
  texts: SourceTexts,
): FactionContent {
  // Army rules are read twice, as words and as tokens, and the catalogue is asked once for each section.
  const asked = new Map<string, ReadonlyMap<string, string>>()
  const sectionsOnce: SectionProse = (section) => remember(asked, JSON.stringify(section), () => sections(section))
  const datasheets = records(parsed, 'datasheets').flatMap((entry) => {
    const datasheetName = localizedField(entry, 'name')
    return datasheetName ? [{ id: stringField(entry, 'id'), name: datasheetName, details: datasheetDetails(entry, texts) }] : []
  })
  const datasheetDetailsByName = new Map(datasheets.map(({ name: datasheetName, details }) => [datasheetName, details]))
  const datasheetIdCandidates = new Map<string, Map<string, DatasheetDetails>>()
  for (const { id, details } of datasheets) {
    if (!id) continue
    const candidates = datasheetIdCandidates.get(id) ?? new Map<string, DatasheetDetails>()
    candidates.set(JSON.stringify(details), details)
    datasheetIdCandidates.set(id, candidates)
  }
  for (const { name: sourceName, details } of datasheets) {
    for (const attachment of details.attachesTo) {
      const target = datasheetDetailsByName.get(attachment.name)
      if (!target) continue
      const list = attachment.kind === 'leader' ? target.leaders : target.supporters
      if (!list.includes(sourceName)) list.push(sourceName)
    }
  }
  const enhancementCandidates = new Map<string, ConstructionEnhancement[]>()
  for (const entry of records(parsed, 'enhancements')) {
    const enhancement = localizedField(entry, 'name')
    const detachment = stringField(entry, 'detachment')
    const id = stringField(entry, 'id')
    if (!enhancement || !detachment) continue
    const key = `${joinKey(detachment)}|${constructionCardKey(enhancement)}`
    enhancementCandidates.set(key, [
      ...(enhancementCandidates.get(key) ?? []),
      {
        ...(id ? { ids: [id] } : {}),
        name: enhancement,
        detachment,
        points: integerField(entry, 'cost'),
        description: localizedField(entry, 'description') ? texts(localizedField(entry, 'description')!, 'prose') : null,
        eligibility: enhancementEligibility(entry, datasheetNames),
      },
    ])
  }
  const enhancements = new Map<string, ConstructionEnhancement[]>()
  for (const candidates of enhancementCandidates.values()) {
    const names = new Set(candidates.map((candidate) => candidate.name))
    const detachments = new Set(candidates.map((candidate) => candidate.detachment))
    if (names.size !== 1 || detachments.size !== 1) continue
    const points = new Set(candidates.map((candidate) => candidate.points))
    const descriptions = new Set(candidates.map((candidate) => candidate.description))
    const restrictions = new Set(candidates.map((candidate) => JSON.stringify(candidate.eligibility)))
    const ids = [...new Set(candidates.flatMap((candidate) => candidate.ids ?? []))]
    const candidate = candidates[0]!
    const resolved = {
      ...candidate,
      ...(ids.length ? { ids } : {}),
      points: points.size === 1 ? candidate.points : null,
      description: descriptions.size === 1 ? candidate.description : null,
      eligibility: restrictions.size === 1 ? candidate.eligibility : null,
    }
    const key = joinKey(candidate.detachment)
    enhancements.set(key, [...(enhancements.get(key) ?? []), resolved])
  }
  const stratagemCandidates = new Map<string, Map<string, FactionStratagem | null>>()
  const stratagemIds = new Map<string, { cards: Map<string, FactionStratagem | null>; name: string }>()
  const stratagemIssues: string[] = []
  for (const entry of records(parsed, 'stratagems')) {
    const detachment = stringField(entry, 'detachment')
    if (!detachment) {
      stratagemIssues.push(`${localizedField(entry, 'name') ?? 'unnamed card'}: missing detachment`)
      continue
    }
    const key = joinKey(detachment)
    const cards = stratagemCandidates.get(key) ?? new Map<string, FactionStratagem | null>()
    stratagemCandidates.set(key, cards)
    const id = stringField(entry, 'id')
    const stratagemName = localizedField(entry, 'name')
    const cp = integerField(entry, 'cost')
    const description = stratagemText(entry, texts)
    const phases =
      cardPhases(entry.phase) ??
      (Array.isArray(entry.phase) && entry.phase.length === 0 ? phaseFromWhen(localizedField(entry, 'when')) : null)
    const turn = cardTurn(entry.turn)
    if (!id || !stratagemName || cp === null || !description) {
      if (stratagemName) cards.set(routeSlug(stratagemName), null)
      if (id) {
        const previous = stratagemIds.get(id)
        if (previous) previous.cards.set(previous.name, null)
      }
      stratagemIssues.push(`${detachment} | ${stratagemName ?? 'unnamed card'}: incomplete card`)
      continue
    }
    if (phases === null || !turn) stratagemIssues.push(`${detachment} | ${stratagemName}: incomplete card`)
    const card = {
      id,
      name: stratagemName,
      cp,
      limit: stratagemLimit(localizedField(entry, 'restrictions')),
      phases,
      turn,
      type: stringField(entry, 'type'),
      description,
    }
    const nameKey = routeSlug(stratagemName)
    const previous = cards.get(nameKey)
    const previousId = stratagemIds.get(id)
    if (previousId && (previousId.cards !== cards || previousId.name !== nameKey)) {
      previousId.cards.set(previousId.name, null)
      cards.set(nameKey, null)
      stratagemIssues.push(`${detachment} | ${stratagemName}: conflicting card id`)
      continue
    }
    stratagemIds.set(id, { cards, name: nameKey })
    if (previous && JSON.stringify(previous) !== JSON.stringify(card)) {
      stratagemIssues.push(`${detachment} | ${stratagemName}: conflicting card name`)
    }
    cards.set(nameKey, previous === undefined ? card : previous && JSON.stringify(previous) === JSON.stringify(card) ? card : null)
  }
  const detachmentRules = new Map<string, Map<string, Set<string>>>()
  for (const entry of detachmentRuleCards(parsed.rules, name, sections, texts)) {
    const key = joinKey(entry.detachment)
    const cards = detachmentRules.get(key) ?? new Map<string, Set<string>>()
    for (const rule of entry.rules) cards.set(rule.name, new Set([...(cards.get(rule.name) ?? []), rule.description]))
    detachmentRules.set(key, cards)
  }
  // Read from the words themselves: the published army rules carry tokens, and a refusal must not depend on them.
  const worded = records(parsed.rules, 'army').flatMap((card) => {
    const description = ruleText(card, name, sectionsOnce, transformed)
    return description ? [description] : []
  })
  const sentences = restrictionSentences(name, worded)
  return {
    name,
    ...(typeof parsed.attribution === 'string' && parsed.attribution.trim()
      ? { attribution: parsed.attribution.trim().slice(0, 500) }
      : {}),
    ...(typeof parsed.parent_name === 'string' ? { parentName: parsed.parent_name } : {}),
    datasheets: new Set(datasheets.map(({ name: datasheetName }) => datasheetName)),
    datasheetDetails: datasheetDetailsByName,
    datasheetIds: new Map(
      [...datasheetIdCandidates].flatMap(([id, candidates]) =>
        candidates.size === 1 ? [[id, candidates.values().next().value!] as const] : [],
      ),
    ),
    detachments: new Set(records(parsed, 'detachments').flatMap((entry) => localizedField(entry, 'name') ?? [])),
    detachmentFactions: new Map(
      records(parsed, 'detachments').flatMap((entry) => {
        const detachment = localizedField(entry, 'name')
        const faction = stringField(entry, 'faction')
        return detachment && faction ? [[detachment, faction] as const] : []
      }),
    ),
    enhancements,
    stratagems: new Map(
      [...stratagemCandidates].map(([detachment, cards]) => [
        detachment,
        [...cards.values()].filter((card): card is FactionStratagem => card !== null),
      ]),
    ),
    stratagemIssues,
    detachmentRules: new Map(
      [...detachmentRules].map(([detachment, rules]) => [
        detachment,
        [...rules].flatMap(([rule, descriptions]) =>
          descriptions.size === 1 ? [{ name: rule, description: descriptions.values().next().value! }] : [],
        ),
      ]),
    ),
    factionAbilityNames: new Set(
      records(parsed, 'datasheets').flatMap((entry) =>
        records(entry.abilities, 'faction').flatMap((ability) => localizedField(ability, 'name') ?? []),
      ),
    ),
    armyRules: records(parsed.rules, 'army').flatMap((card) => {
      const title = localizedField(card, 'name')
      const description = ruleText(card, name, sectionsOnce, texts)
      return title && description ? [{ name: title, description }] : []
    }),
    restrictions: restrictionsIn(sentences),
    restrictionLists: restrictionListsIn(sentences),
  }
}
/**
 * A rule card's ordered blocks as one markdown text, headers and all.
 *
 * A block the file titles and says nothing about is a section of the card the file
 * does not carry: the six Agile Manoeuvres under the Aeldari Battle Focus heading are
 * titles alone. The title is the source's own word for it and is kept, and the heading
 * those titles sit under says which entry `sections` should ask — the catalogue names
 * it for the card and the section together, `Battle Focus - Agile Manoeuvres`. A title
 * under no heading is named and left at that.
 */
function ruleText(card: Record<string, unknown>, faction: string, sections: SectionProse, texts: SourceTexts) {
  const name = localizedField(card, 'name')
  const blocks = records(card, 'rules').toSorted((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
  const titles = new Map<string, string[]>()
  let heading: string | null = null
  for (const rule of blocks) {
    const text = localizedField(rule, 'text')
    const title = localizedField(rule, 'title')
    if (rule.type === 'header' && text) heading = text
    else if (title && !text && heading) titles.set(heading, [...(titles.get(heading) ?? []), title])
  }
  const described = new Map(
    name ? [...titles].flatMap(([section, named]) => [...sections({ faction, entry: `${name} - ${section}`, titles: named })]) : [],
  )
  return blocks
    .flatMap((rule) => {
      if (rule.type === 'image') return []
      const text = localizedField(rule, 'text')
      const title = localizedField(rule, 'title')
      if (!text) {
        if (!title) return []
        const description = described.get(title)
        return [`### ${title}`, ...(description ? [prose(description)] : [])]
      }
      return rule.type === 'header' || title ? [`### ${title ?? text}`, ...(title ? [texts(text, 'prose')] : [])] : [texts(text, 'prose')]
    })
    .join('\n\n')
}
export function detachmentRuleCards(
  rules: unknown,
  faction: string,
  sections: SectionProse,
  texts: SourceTexts,
): { detachment: string; rules: RuleCard[] }[] {
  return records(rules, 'detachment').flatMap((entry) => {
    const detachment = stringField(entry, 'detachment')
    if (!detachment) return []
    const cards = records(entry, 'rules').flatMap((card) => {
      const name = localizedField(card, 'name')
      const description = ruleText(card, faction, sections, texts)
      return name && description ? [{ name, description }] : []
    })
    return cards.length ? [{ detachment, rules: cards }] : []
  })
}
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const TABLE = /<table>[^]*?(?:<\/table>|$)/g
/** Convert supported source tags to Markdown, preserve line breaks, and leave tables intact for `RuleText` to render. */
export function prose(text: string) {
  const tables: string[] = []
  const converted = text
    .replaceAll(TABLE, (table) => `\uE000${tables.push(table) - 1}\uE000`)
    .replaceAll('\r', '\n')
    .replaceAll(/<\/?(?:k|b)>/g, '**')
    .replaceAll(/<\/?(?:u|i)>/g, '')
    .replaceAll(/<br\s*\/?>/g, '\n')
    .replaceAll(/<\/?ul>/g, '\n')
    .replaceAll(/<li>/g, '\n- ')
    .replaceAll(/<\/li>/g, '')
    .replaceAll(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) => ENTITIES[entity] ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
  // Items the source separated with a break are one list, not one list per item.
  let tight = converted
  for (let previous = ''; previous !== tight;) {
    previous = tight
    tight = tight.replace(/(^|\n)(- [^\n]*)\n\n(?=- )/, '$1$2\n')
  }
  return tight.trim().replaceAll(/\uE000(\d+)\uE000/g, (_, at: string) => tables[Number(at)] ?? '')
}
/** How a source string reads once loaded; the server reads the source through this and so does a reader's browser. */
export function transformed(raw: string, transform: TextTransform) {
  if (transform === 'prose') return prose(raw)
  if (transform === 'trim') return raw.trim()
  if (transform === 'rest') return prose(raw.replaceAll(LIST_ITEM, '').replaceAll(/<\/?ul>/g, ''))
  if (transform.startsWith('item')) return prose([...raw.matchAll(LIST_ITEM)][Number(transform.slice(4))]?.[1] ?? '')
  if (transform === 'condition') return whenDrawnCondition(raw) ?? ''
  return raw
}

/** What a secondary card's when-drawn rule says must hold for it to be discarded and replaced, as the card prints it. */
export function whenDrawnCondition(text: string) {
  const plain = text.trim().replaceAll('**', '').replaceAll('‑', '-').replaceAll(/\s+/g, ' ')
  const replacement = /^WHEN DRAWN: If (.+?), you can discard this card and draw one new Secondary Mission card\.?$/i.exec(plain)
  return replacement ? replacement[1]!.replace(/^there /i, 'there ') : null
}
export function enhancementEligibility(
  card: Record<string, unknown>,
  datasheetNames: readonly string[] = [],
): EnhancementEligibility | null {
  const description = localizedField(card, 'description')
    ?.replaceAll(/<[^>]*>|\*\*/g, '')
    .replace(/\b(models?) only \(excluding (.*?)\)\./i, '$1 (excluding $2) only.')
  const equipped = /^(.*?)\s+model equipped with an? ([^.]+?) only\./i.exec(description ?? '')
  const restriction = equipped ? `${equipped[1]} model only.` : description
  const deepStrike = /^(.*?)\s+model with the Deep Strike ability only\./i.exec(restriction ?? '')
  const plain = deepStrike?.[1] ?? /^(.*?)\s+(?:model|unit)s? only\./i.exec(restriction ?? '')?.[1]
  const clause = plain ?? /^(.*?) only\./i.exec(restriction ?? '')?.[1]
  const sourceKeywords = card.keywords
  const keywords = Array.isArray(sourceKeywords) ? sourceKeywords.filter((value): value is string => typeof value === 'string') : []
  const invalidKeywords =
    !Array.isArray(sourceKeywords) || keywords.length !== sourceKeywords.length || keywords.some((keyword) => !keyword || keyword === 'DNU')
  if (!clause) {
    if (!description || /\bonly\b/i.test(description) || invalidKeywords || !keywords.length || card.equipableByNonCharacter !== false)
      return null
    return { anyOf: [[...keywords, ...(keywords.some((keyword) => joinKey(keyword) === 'character') ? [] : ['Character'])]], excluded: [] }
  }
  const exclusion = /^(.*?)\s+\(excluding (.*?) models?\)$/i.exec(clause)
  const included = exclusion ? exclusion[1]!.replace(/\s+(?:model|unit)s?$/i, '') : clause
  if (/[()]|\b(?:and|without|excluding|except)\b/i.test(included)) return null
  if (
    card.equipableByNonCharacter === false &&
    /\bCHARACTER\b/i.test(included) &&
    !keywords.some((keyword) => joinKey(keyword) === 'character')
  ) {
    keywords.push('Character')
  }
  const words = (text: string) =>
    text
      .normalize('NFKD')
      .replaceAll(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  const requirement = (phrase: string) => {
    const key = joinKey(phrase)
    const named = datasheetNames.filter((name) => joinKey(name) === key)
    if (named.length === 1) return [named[0]!]
    const exact = !invalidKeywords ? keywords.filter((keyword) => joinKey(keyword) === key) : []
    if (exact.length === 1) return exact
    const ending = words(phrase)
    const endingText = ending.join(' ')
    const suffixed = ending.length >= 2 ? datasheetNames.filter((name) => words(name).slice(-ending.length).join(' ') === endingText) : []
    if (suffixed.length === 1) return [suffixed[0]!]
    if ((!plain && !exclusion) || invalidKeywords || !keywords.length) return null
    const required = new Set(words(phrase))
    const selected = keywords.filter((keyword) => words(keyword).every((word) => required.has(word)))
    const covered = new Set(words(selected.join(' ')))
    return required.size && [...required].every((word) => covered.has(word)) ? selected : null
  }
  const phrases = included.split(/\s+or\s+|\//i)
  if (phrases.length > 3) return null
  const exact = (phrase: string) => {
    const key = joinKey(phrase)
    return datasheetNames.some((name) => joinKey(name) === key) || keywords.some((keyword) => joinKey(keyword) === key)
  }
  const alternatives: string[][][] = []
  if (included.includes('/') && !phrases.every(exact) && phrases.length === 2 && !invalidKeywords) {
    const [left, right] = phrases.map(words)
    for (const first of keywords) {
      if (joinKey(phrases[0]!) === joinKey(first)) {
        for (const second of keywords) {
          const secondWords = words(second)
          if (right?.slice(0, secondWords.length).join(' ') !== secondWords.join(' ')) continue
          const common = requirement(right.slice(secondWords.length).join(' '))
          if (common?.length)
            alternatives.push([
              [first, ...common],
              [second, ...common],
            ])
        }
      }
      if (joinKey(phrases[1]!) === joinKey(first)) {
        for (const second of keywords) {
          const secondWords = words(second)
          if (left?.slice(-secondWords.length).join(' ') !== secondWords.join(' ')) continue
          const common = requirement(left.slice(0, -secondWords.length).join(' '))
          if (common?.length)
            alternatives.push([
              [...common, second],
              [...common, first],
            ])
        }
      }
    }
  }
  const shared = uniqueBy(alternatives, (candidate) => JSON.stringify(candidate))
  const anyOf = included.includes('/')
    ? phrases.every(exact)
      ? phrases.map(requirement)
      : shared.length === 1
        ? shared[0]!
        : []
    : phrases.map(requirement)
  if (!anyOf.length || anyOf.some((entry) => !entry?.length)) return null
  const excluded = exclusion ? exclusion[2]!.split(/\s+(?:or|and)\s+/i) : []
  if (excluded.some((name) => !name || /[()/]|\b(?:and|with|without)\b/i.test(name))) return null
  return {
    anyOf: anyOf as string[][],
    excluded,
    ...(deepStrike ? { requiredAbilities: ['Deep Strike'] } : {}),
    ...(equipped ? { requiredWargear: [equipped[2]!] } : {}),
  }
}
/** A stratagem's card, section by section, in the order the card prints them. */
export function stratagemText(card: Record<string, unknown>, texts: SourceTexts) {
  const section = (label: string, field: string) => {
    const text = localizedField(card, field)
    return text ? `**${label}:** ${texts(text, 'prose')}` : null
  }
  const sections = [
    section('When', 'when'),
    section('Target', 'target'),
    section('Effect', 'effect'),
    section('Restrictions', 'restrictions'),
  ].filter((part): part is string => Boolean(part))
  return sections.length ? sections.join('\n\n') : null
}
export function stratagemLimit(restrictions: string | null): Stratagem['limit'] {
  const text = restrictions?.replaceAll(/<[^>]*>|\*\*/g, '') ?? ''
  const usage =
    /(?:you cannot use this stratagem more than|you can only use this stratagem|this stratagem can only be used) once per (battle round|battle|turn)\b/i.exec(
      text,
    )
  return usage?.[1]?.toLowerCase() === 'battle round'
    ? 'battle-round'
    : usage?.[1]?.toLowerCase() === 'battle'
      ? 'battle'
      : usage?.[1]?.toLowerCase() === 'turn'
        ? 'turn'
        : 'phase'
}
type RestrictionSentence = { faction: string; sentence: string }

/** Parse only supported faction bans and keyword exemptions; `factionRestrictionCoverageIssues` reports unmatched source wording rather than silently allowing it. */
function restrictionsIn(sentences: readonly RestrictionSentence[]): FactionRestriction[] {
  const restrictions = new Map<string, { owner: string; excludedNames: Map<string, string | null>; excludedKeywords: Set<string> }>()
  const forFaction = (owner: string) => {
    const key = routeSlug(owner)
    const found = restrictions.get(key) ?? { owner, excludedNames: new Map<string, string | null>(), excludedKeywords: new Set<string>() }
    restrictions.set(key, found)
    return found
  }
  for (const { faction, sentence } of sentences) {
    const conditional = sentence.match(/^If your army includes one or more ([A-Z][A-Z ]+?) units, it cannot include/)
    const owner = conditional?.[1] ?? faction
    for (const match of sentence.matchAll(/cannot include (?:any of )?the following [^:]*?(?:units|models|datasheets)([^:]*):\s*(.*)$/g)) {
      const qualifier = match[1] ?? ''
      const exemption =
        qualifier.match(/that do not have the ([A-Za-z' ]+) keyword/)?.[1]?.toLowerCase() ??
        (/^\s*from\b/.test(qualifier) ? catalogueFactionName(owner).toLowerCase() : null)
      for (const name of listedNames(match[2])) forFaction(owner).excludedNames.set(name, exemption)
    }
    if (
      /BLACK TEMPLARS units[^.]*cannot include any ADEPTUS ASTARTES PSYKER models/i.test(sentence) ||
      (/^Your army cannot include any ADEPTUS ASTARTES PSYKER models/i.test(sentence) && routeSlug(faction) === 'black-templars')
    ) {
      forFaction('Black Templars').excludedKeywords.add('psyker')
    }
  }
  return [...restrictions.values()].map(({ owner, excludedNames, excludedKeywords }) => ({
    owner,
    excludedNames: [...excludedNames],
    excludedKeywords: [...excludedKeywords],
  }))
}

/** Every named exclusion list the sentences state, whether or not `restrictionsIn` typed it. */
function restrictionListsIn(sentences: readonly RestrictionSentence[]) {
  return sentences.flatMap(({ faction, sentence }) =>
    [...sentence.matchAll(/cannot include[^.]*?following [^:]*?(?:units|models|datasheets)[^:]*:\s*(.*)$/g)].map((match) => ({
      faction,
      names: listedNames(match[1]),
    })),
  )
}

/** The bans and exemptions every faction's army rules state, merged across the files that state them. */
export function factionRestrictions(datacards: Pick<LoadedDatacards, 'factions'>) {
  const restrictions = new Map<string, { excludedNames: Map<string, string | null>; excludedKeywords: Set<string> }>()
  for (const content of new Set(datacards.factions.values())) {
    for (const restriction of content.restrictions) {
      const key = routeSlug(restriction.owner)
      const found = restrictions.get(key) ?? { excludedNames: new Map<string, string | null>(), excludedKeywords: new Set<string>() }
      restrictions.set(key, found)
      for (const [name, exemption] of restriction.excludedNames) found.excludedNames.set(name, exemption)
      for (const keyword of restriction.excludedKeywords) found.excludedKeywords.add(keyword)
    }
  }
  return restrictions as ReadonlyMap<string, FactionRestrictions>
}
/** Why a unit is refused by a faction's construction rules, or null when it is allowed. */
export function restrictedBy(
  restrictions: FactionRestrictions,
  name: string,
  keywords: readonly string[],
): { keyword: string | null } | null {
  const carried = keywords.map((keyword) => withoutFactionPrefix(keyword).trim())
  const keyword = carried.find((candidate) => restrictions.excludedKeywords.has(candidate.toLowerCase()))
  if (keyword) return { keyword }
  const lowered = name.trim().toLowerCase()
  if (!restrictions.excludedNames.has(lowered)) return null
  const exemption = restrictions.excludedNames.get(lowered)
  return exemption && carried.some((candidate) => candidate.toLowerCase() === exemption) ? null : { keyword: null }
}
/** Every named exclusion list the prose states that `factionRestrictions` did not type. */
export function factionRestrictionCoverageIssues(datacards: Pick<LoadedDatacards, 'factions'>) {
  const parsed = factionRestrictions(datacards)
  const captured = new Set([...parsed.values()].flatMap((rule) => [...rule.excludedNames.keys()]))
  const issues: string[] = []
  for (const content of new Set(datacards.factions.values())) {
    for (const { faction, names } of content.restrictionLists) {
      const missing = names.filter((name) => !captured.has(name))
      if (missing.length) issues.push(`${faction}: ${missing.join(', ')}`)
    }
  }
  return issues
}
/**
 * Each sentence of one file's army rules, with the faction it speaks for: the file's own,
 * or the sub-heading it sits under — the Space Marines rule states the Deathwatch's
 * exclusions beneath a **DEATHWATCH** heading.
 */
function restrictionSentences(fileFaction: string, descriptions: readonly string[]) {
  const found: RestrictionSentence[] = []
  for (const description of descriptions) {
    let faction = fileFaction
    let list: RestrictionSentence | null = null
    for (const line of description.split('\n')) {
      const bullet = /^\s*-\s+/.test(line)
      const plain = line
        .replaceAll('**', '')
        .replace(/^[■□\s-]+/, '')
        .trim()
      if (!plain) continue
      if (bullet && list) {
        list.sentence += `; ${plain.replace(/\s+(?:units|models|datasheets)\.?$/i, '').replace(/\.$/, '')}`
        continue
      }
      list = null
      if (/^[A-Z][A-Z' ]+$/.test(plain)) {
        faction = plain
        continue
      }
      for (const sentence of plain.split(/(?<=\.)\s+/)) {
        const entry = { faction, sentence: sentence.trim() }
        found.push(entry)
        if (/cannot include[^.]*?following [^:]*:\s*$/.test(entry.sentence)) list = entry
      }
    }
  }
  return found
}
const listedNames = (names: string | undefined) =>
  (names ?? '')
    .replace(/\.$/, '')
    .split(';')
    .map((name) =>
      name
        .replace(/^[^:]+:\s*/, '')
        .replace(/^[^\p{L}]+/u, '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
/**
 * The source names everything in eight languages. This product is in one, and a value
 * that is only a string is taken as it is rather than skipped.
 */
export function english(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (!value || typeof value !== 'object') return null
  const translated = (value as Record<string, unknown>).en
  return typeof translated === 'string' ? translated.trim() || null : null
}

export function localizedField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object') return null
  const localized: unknown = (value as Record<string, unknown>)[field]
  if (!localized || typeof localized !== 'object') return null
  const translated: unknown = (localized as Record<string, unknown>).en
  return typeof translated === 'string' ? translated : null
}
function localizedList(value: unknown, field: string): string[] {
  if (!value || typeof value !== 'object') return []
  const localized: unknown = (value as Record<string, unknown>)[field]
  if (!Array.isArray(localized)) return []
  return localized.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const translated: unknown = (entry as Record<string, unknown>).en
    return typeof translated === 'string' ? [translated] : []
  })
}
const LIST_ITEM = /<li>([^]*?)<\/li>/g
/**
 * Composition as the lines a datasheet prints, and the loadout some of them carry.
 *
 * Nearly every entry is one line per model type, but a few factions write the whole
 * thing as the source's own `<ul>` list with the equipment sentence loose after it
 * and the loadout field left empty. The bullets are the composition — a count read
 * from the sentence beside them would count weapons as models — and what follows
 * them is the loadout the entry did not fill in.
 */
function composition(value: unknown, texts: SourceTexts): { lines: string[]; loadout: string | null } {
  const lines: string[] = []
  const loose: string[] = []
  for (const entry of localizedList(value, 'composition')) {
    if (!entry.includes('<li>')) {
      if (entry) lines.push(texts(entry, 'plain'))
      continue
    }
    const items = [...entry.matchAll(LIST_ITEM)].length
    for (let at = 0; at < items; at += 1) if (transformed(entry, `item${at}`)) lines.push(texts(entry, `item${at}`))
    if (transformed(entry, 'rest')) loose.push(texts(entry, 'rest'))
  }
  return { lines, loadout: loose.join('\n\n') || null }
}
/** How many models a composition prints, read from its words: a range across its lines and alternatives. */
export function compositionCount(lines: readonly string[]) {
  const alternatives: { minimum: number; maximum: number }[][] = [[]]
  for (const line of lines) {
    if (line.trim().toLocaleLowerCase() === 'or') {
      alternatives.push([])
      continue
    }
    // Any dash the source writes, non-breaking hyphens included, joins one range.
    for (const count of line.matchAll(/(\d+)(?:\s*\p{Pd}\s*(\d+))?/gu)) {
      alternatives.at(-1)?.push({ minimum: Number(count[1]), maximum: Number(count[2] ?? count[1]) })
    }
  }
  const totals = alternatives.flatMap((groups) =>
    groups.length
      ? [
          {
            minimum: groups.reduce((total, group) => total + group.minimum, 0),
            maximum: groups.reduce((total, group) => total + group.maximum, 0),
          },
        ]
      : [],
  )
  if (!totals.length) return `${lines.length} ${lines.length === 1 ? 'model' : 'models'}`

  const minimum = Math.min(...totals.map((total) => total.minimum))
  const maximum = Math.max(...totals.map((total) => total.maximum))
  const count = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`
  return `${count} ${maximum === 1 ? 'model' : 'models'}`
}

/** Codex-shaped entries print the transport rule as a special ability rather than in its own field. */
function specialTransport(value: unknown): string | null {
  const abilities: unknown = value && typeof value === 'object' ? (value as Record<string, unknown>).abilities : null
  const transport = records(abilities, 'special').find((ability) => localizedField(ability, 'name')?.toUpperCase() === 'TRANSPORT')
  return localizedField(transport, 'description')
}
/** The heading the source gives a datasheet's starting wargear: a label the builder reads, not rules text. */
export const DEFAULT_WARGEAR = 'Default Wargear'
/** Labels the source prints where it has no rules text to give, which pages read as labels. */
const LABELS = new Set([DEFAULT_WARGEAR, 'None'])
const labelOr = (texts: SourceTexts) => (raw: string) => (LABELS.has(raw.trim()) ? raw : texts(raw, 'plain'))
function datasheetDetails(value: unknown, texts: SourceTexts): DatasheetDetails {
  const wargearGroups = records(value, 'wargearOptions').flatMap((group) => {
    const printed = localizedField(group, 'instruction')
    const instruction = printed ? labelOr(texts)(printed) : printed
    const options = records(group, 'options').flatMap((option) => {
      const name = localizedField(option, 'name')
      return name ? [name] : []
    })
    return instruction && options.length ? [{ instruction, options }] : []
  })
  const { lines, loadout } = composition(value, texts)
  const counted = composition(value, transformed).lines
  const transport = localizedField(value, 'transport') ?? specialTransport(value)
  const printedLoadout = localizedField(value, 'loadout')
  const capacity = transport ? printedTransport(prose(transport)) : null
  return {
    composition: lines,
    ...(counted.length ? { modelCount: compositionCount(counted) } : {}),
    loadout: printedLoadout ? texts(printedLoadout, 'plain') : loadout,
    wargear: localizedList(value, 'wargear').map(labelOr(texts)),
    ...(wargearGroups.length ? { wargearGroups } : {}),
    baseSize: displayBaseSize(localizedField(value, 'baseSize')),
    transport: transport ? texts(transport, 'prose') : null,
    ...(capacity ? { transportCapacity: capacity } : {}),
    points: records(value, 'points').flatMap((point) => {
      const models = stringField(point, 'models')
      const cost = stringField(point, 'cost')
      return models && cost
        ? [
            {
              models,
              cost,
              keyword: stringField(point, 'keyword'),
              faction: stringField(point, 'faction'),
              detachment: stringField(point, 'detachment'),
            },
          ]
        : []
    }),
    attachesTo: records(value, 'attachesTo').flatMap((attachment) => {
      const kind = stringField(attachment, 'type')
      const name = stringField(attachment, 'target')
      return (kind === 'leader' || kind === 'support') && name ? [{ kind, name }] : []
    }),
    leaders: [],
    supporters: [],
  }
}
function displayBaseSize(baseSize: string | null): string | null {
  if (baseSize === 'Large Flying Base') return 'Large Flying Base (Ø60mm)'
  if (baseSize === 'Small Flying Base') return 'Small Flying Base (Ø32mm)'
  if (baseSize === 'Aircraft Flying Base') return 'Aircraft Flying Base (120 × 92 mm oval)'
  return baseSize
}
export function records(value: unknown, field: string): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return []
  const entries: unknown = (value as Record<string, unknown>)[field]
  return Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    : []
}
export function stringField(value: Record<string, unknown>, field: string): string | null {
  const found = value[field]
  return typeof found === 'string' ? found : typeof found === 'number' ? String(found) : null
}
export function integerField(value: Record<string, unknown>, field: string): number | null {
  const found = value[field]
  const parsed = typeof found === 'number' ? found : typeof found === 'string' && /^\d+$/.test(found) ? Number(found) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}
