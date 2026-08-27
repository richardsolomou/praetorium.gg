import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { catalogueFactionName } from './factionNames'

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
  baseSize: string | null
  transport: string | null
  points: { models: string; cost: string; keyword: string | null; faction: string | null; detachment: string | null }[]
  attachesTo: { kind: 'leader' | 'support'; name: string }[]
  leaders: string[]
  supporters: string[]
}

export type RuleCard = { name: string; description: string }

export type FactionContent = {
  name: string
  datasheets: Set<string>
  datasheetDetails: Map<string, DatasheetDetails>
  detachments: Set<string>
  armyRules: RuleCard[]
  /** The army rules its datasheets print by name, whether or not the file carries the card. */
  factionAbilityNames: Set<string>
}

export type LoadedDatacards = {
  /** By the slug of every name a faction answers to. */
  factions: Map<string, FactionContent>
  /** By detachment slug. */
  detachmentRules: ReadonlyMap<string, readonly RuleCard[]>
  /** By `descriptionKey`. */
  enhancements: ReadonlyMap<string, string>
  stratagems: ReadonlyMap<string, string>
  /** Every army rule by its slug, where the files agree on what it says. */
  armyRules: ReadonlyMap<string, string>
}

export type FactionRestrictions = {
  /** Lowercased datasheet names, each with the lowercased keyword that exempts a unit from it, if any. */
  excludedNames: ReadonlyMap<string, string | null>
  excludedKeywords: ReadonlySet<string>
}

type DatacardsFaction = {
  id?: unknown
  name?: unknown
  datasheets?: unknown
  detachments?: unknown
  rules?: unknown
  enhancements?: unknown
  stratagems?: unknown
}

/** A card names its detachment and itself; `(Aura)` and `(Upgrade)` are printed by some sources and not others. */
export const descriptionKey = (detachment: string, name: string) =>
  `${routeSlug(detachment)}|${routeSlug(name).replaceAll(/-(?:aura|upgrade)(?=-|$)/g, '')}`

export function loadDatacards(directory: string): LoadedDatacards {
  const factions = new Map<string, FactionContent>()
  const detachmentRules = new Map<string, Map<string, Set<string>>>()
  const enhancements = new Map<string, Set<string>>()
  const stratagems = new Map<string, Set<string>>()
  const armyRules = new Map<string, Set<string>>()
  const remember = (into: Map<string, Set<string>>, key: string, text: string) => {
    const found = into.get(key) ?? new Set<string>()
    found.add(text)
    into.set(key, found)
  }
  if (!fs.existsSync(directory))
    return { factions, detachmentRules: new Map(), enhancements: new Map(), stratagems: new Map(), armyRules: new Map() }
  for (const fileName of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8')) as DatacardsFaction
    if (typeof parsed.name !== 'string' || !Array.isArray(parsed.datasheets) || !Array.isArray(parsed.detachments)) continue
    const content = factionContent(parsed.name, parsed)
    for (const name of new Set([parsed.name, catalogueFactionName(parsed.name)])) factions.set(routeSlug(name), content)
    for (const rule of content.armyRules) remember(armyRules, routeSlug(rule.name), rule.description)

    for (const entry of detachmentRuleCards(parsed.rules)) {
      const rules = detachmentRules.get(routeSlug(entry.detachment)) ?? new Map<string, Set<string>>()
      for (const rule of entry.rules) {
        const texts = rules.get(rule.name) ?? new Set<string>()
        texts.add(rule.description)
        rules.set(rule.name, texts)
      }
      detachmentRules.set(routeSlug(entry.detachment), rules)
    }
    for (const enhancement of records(parsed, 'enhancements')) {
      const name = localizedField(enhancement, 'name')
      const detachment = stringField(enhancement, 'detachment')
      const description = localizedField(enhancement, 'description')
      if (name && detachment && description) remember(enhancements, descriptionKey(detachment, name), prose(description))
    }
    for (const stratagem of records(parsed, 'stratagems')) {
      const name = localizedField(stratagem, 'name')
      const detachment = stringField(stratagem, 'detachment')
      const description = stratagemText(stratagem)
      if (name && detachment && description) remember(stratagems, descriptionKey(detachment, name), description)
    }
  }
  return {
    factions,
    detachmentRules: new Map(
      [...detachmentRules].map(([detachment, rules]) => [
        detachment,
        [...rules].flatMap(([name, texts]) => (texts.size === 1 ? [{ name, description: texts.values().next().value! }] : [])),
      ]),
    ),
    enhancements: unique(enhancements),
    stratagems: unique(stratagems),
    armyRules: unique(armyRules),
  }
}

export const loadFactionContents = (directory: string) => loadDatacards(directory).factions

const unique = (candidates: ReadonlyMap<string, Set<string>>) =>
  new Map([...candidates].flatMap(([key, texts]) => (texts.size === 1 ? [[key, texts.values().next().value!] as const] : [])))

function factionContent(name: string, parsed: DatacardsFaction): FactionContent {
  const datasheets = records(parsed, 'datasheets').flatMap((entry) => {
    const datasheetName = localizedField(entry, 'name')
    return datasheetName ? [{ name: datasheetName, details: datasheetDetails(entry) }] : []
  })
  const datasheetDetailsByName = new Map(datasheets.map(({ name: datasheetName, details }) => [datasheetName, details]))
  for (const { name: sourceName, details } of datasheets) {
    for (const attachment of details.attachesTo) {
      const target = datasheetDetailsByName.get(attachment.name)
      if (!target) continue
      const list = attachment.kind === 'leader' ? target.leaders : target.supporters
      if (!list.includes(sourceName)) list.push(sourceName)
    }
  }
  return {
    name,
    datasheets: new Set(datasheets.map(({ name: datasheetName }) => datasheetName)),
    datasheetDetails: datasheetDetailsByName,
    detachments: new Set(records(parsed, 'detachments').flatMap((entry) => localizedField(entry, 'name') ?? [])),
    factionAbilityNames: new Set(
      records(parsed, 'datasheets').flatMap((entry) =>
        records(entry.abilities, 'faction').flatMap((ability) => localizedField(ability, 'name') ?? []),
      ),
    ),
    armyRules: records(parsed.rules, 'army').flatMap((card) => {
      const cardName = localizedField(card, 'name')
      const description = ruleText(card)
      return cardName && description ? [{ name: cardName, description }] : []
    }),
  }
}

/** A rule card's ordered blocks as one markdown text, headers and all. */
function ruleText(card: Record<string, unknown>) {
  return records(card, 'rules')
    .toSorted((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
    .flatMap((rule) => {
      const text = localizedField(rule, 'text')
      if (!text || rule.type === 'image') return []
      const title = localizedField(rule, 'title')
      return rule.type === 'header' || title ? [`### ${title ?? text}`, ...(title ? [prose(text)] : [])] : [prose(text)]
    })
    .join('\n\n')
}

function detachmentRuleCards(rules: unknown): { detachment: string; rules: RuleCard[] }[] {
  return records(rules, 'detachment').flatMap((entry) => {
    const detachment = stringField(entry, 'detachment')
    if (!detachment) return []
    const cards = records(entry, 'rules').flatMap((card) => {
      const name = localizedField(card, 'name')
      const description = ruleText(card)
      return name && description ? [{ name, description }] : []
    })
    return cards.length ? [{ detachment, rules: cards }] : []
  })
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Card prose as the app's markdown.
 *
 * The files write markdown and mix a few HTML tags into it: `<k>` around a keyword and
 * `<b>` around emphasis, which `RuleText` reads as `**…**` the way the catalogues
 * already write them; `<ul>`/`<li>` for the lists a card prints; `<u>` and `<i>`
 * that carry nothing the app renders. Line breaks are the card's own and are kept.
 */
export function prose(text: string) {
  const converted = text
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
  return tight.trim()
}

/** A stratagem's card, section by section, in the order the card prints them. */
export function stratagemText(card: Record<string, unknown>) {
  const section = (label: string, field: string) => {
    const text = localizedField(card, field)
    return text ? `**${label}:** ${prose(text)}` : null
  }
  const fluff = localizedField(card, 'fluff')
  const sections = [
    fluff ? prose(fluff) : null,
    section('When', 'when'),
    section('Target', 'target'),
    section('Effect', 'effect'),
    section('Restrictions', 'restrictions'),
  ].filter((part): part is string => Boolean(part))
  return sections.length ? sections.join('\n\n') : null
}

/**
 * The army-construction rules the prose states, typed so legality and the picker can
 * read them.
 *
 * Three forms are read, and nothing else: a list a named faction's presence forbids
 * ("If your army includes one or more SPACE WOLVES units, it cannot include … the
 * following units: …"), a list the faction's own rule forbids ("Your army cannot
 * include any of the following units: …"), and the Black Templars' ban on Psykers. A
 * list may exempt units carrying a keyword — "models that do not have the Black
 * Templars keyword", or datasheets "from Codex: Space Marines" — and the exemption is
 * kept beside each name. `factionRestrictionCoverageIssues` names every list this
 * did not capture, so a rewording fails the check instead of silently allowing units.
 */
export function factionRestrictions(datacards: Pick<LoadedDatacards, 'factions'>) {
  const restrictions = new Map<string, { excludedNames: Map<string, string | null>; excludedKeywords: Set<string> }>()
  const forFaction = (faction: string) => {
    const key = routeSlug(faction)
    const found = restrictions.get(key) ?? { excludedNames: new Map<string, string | null>(), excludedKeywords: new Set<string>() }
    restrictions.set(key, found)
    return found
  }
  for (const { faction, sentence } of restrictionSentences(datacards)) {
    const conditional = sentence.match(/^If your army includes one or more ([A-Z][A-Z ]+?) units, it cannot include/)
    const owner = conditional?.[1] ?? faction
    for (const match of sentence.matchAll(/cannot include (?:any of )?the following (?:units|models|datasheets)([^:]*):\s*(.*)$/g)) {
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
  return restrictions as ReadonlyMap<string, FactionRestrictions>
}

/** Why a unit is refused by a faction's construction rules, or null when it is allowed. */
export function restrictedBy(
  restrictions: FactionRestrictions,
  name: string,
  keywords: readonly string[],
): { keyword: string | null } | null {
  const carried = keywords.map((keyword) => keyword.replace(/^faction:\s*/i, '').trim())
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
  for (const { faction, sentence } of restrictionSentences(datacards)) {
    for (const match of sentence.matchAll(/cannot include[^.]*?following (?:units|models|datasheets)[^:]*:\s*(.*)$/g)) {
      const missing = listedNames(match[1]).filter((name) => !captured.has(name))
      if (missing.length) issues.push(`${faction}: ${missing.join(', ')}`)
    }
  }
  return issues
}

/**
 * Each sentence of every army rule, with the faction it speaks for: the file's own,
 * or the sub-heading it sits under — the Space Marines rule states the Deathwatch's
 * exclusions beneath a **DEATHWATCH** heading.
 */
function restrictionSentences(datacards: Pick<LoadedDatacards, 'factions'>) {
  const found: { faction: string; sentence: string }[] = []
  const seen = new Set<FactionContent>()
  for (const content of datacards.factions.values()) {
    if (seen.has(content)) continue
    seen.add(content)
    for (const rule of content.armyRules) {
      let faction = content.name
      for (const line of rule.description.split('\n')) {
        const plain = line
          .replaceAll('**', '')
          .replace(/^[■□\s-]+/, '')
          .trim()
        if (!plain) continue
        if (/^[A-Z][A-Z' ]+$/.test(plain)) {
          faction = plain
          continue
        }
        for (const sentence of plain.split(/(?<=\.)\s+/)) found.push({ faction, sentence: sentence.trim() })
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

export function localizedField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object') return null
  const localized: unknown = (value as Record<string, unknown>)[field]
  if (!localized || typeof localized !== 'object') return null
  const english: unknown = (localized as Record<string, unknown>).en
  return typeof english === 'string' ? english : null
}

function localizedList(value: unknown, field: string): string[] {
  if (!value || typeof value !== 'object') return []
  const localized: unknown = (value as Record<string, unknown>)[field]
  if (!Array.isArray(localized)) return []
  return localized.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const english: unknown = (entry as Record<string, unknown>).en
    return typeof english === 'string' ? [english] : []
  })
}

function datasheetDetails(value: unknown): DatasheetDetails {
  return {
    composition: localizedList(value, 'composition'),
    loadout: localizedField(value, 'loadout'),
    wargear: localizedList(value, 'wargear'),
    baseSize: displayBaseSize(localizedField(value, 'baseSize')),
    transport: localizedField(value, 'transport'),
    points: records(value, 'points').flatMap((point) => {
      const models = stringField(point, 'models')
      const cost = stringField(point, 'cost')
      return models && cost
        ? [
            {
              models,
              cost,
              keyword: nullableStringField(point, 'keyword'),
              faction: nullableStringField(point, 'faction'),
              detachment: nullableStringField(point, 'detachment'),
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

function records(value: unknown, field: string): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return []
  const entries: unknown = (value as Record<string, unknown>)[field]
  return Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    : []
}

function stringField(value: Record<string, unknown>, field: string): string | null {
  const found = value[field]
  return typeof found === 'string' ? found : typeof found === 'number' ? String(found) : null
}

function nullableStringField(value: Record<string, unknown>, field: string): string | null {
  return value[field] === null || value[field] === undefined ? null : stringField(value, field)
}
