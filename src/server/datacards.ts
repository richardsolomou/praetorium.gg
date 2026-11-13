import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { normalizeRuleReference } from '../core/ruleReference'
import { readSharedJson } from './sharedJson'
import { joinKey } from '../core/text'
import {
  type RuleCard,
  type SectionProse,
  type ConstructionDetachment,
  type FactionContent,
  type LoadedDatacards,
  type DatacardsFaction,
  descriptionKey,
  datacardsFactionKeys,
  factionContent,
  detachmentRuleCards,
  stratagemText,
  localizedField,
  records,
  stringField,
  integerField,
  transformed,
} from '../shared/datacards'
import { completeSteps, type Steps } from '../shared/steps'
import { type SourceTexts, comparableText, textKey, textTokensIn } from '../core/sourceText'
import { textFactsOf } from '../shared/textFacts'
import type { TextFacts } from '../core/textFacts'
import { publishedTexts } from './sourceTexts'
export * from '../shared/datacards'
const NO_SECTIONS: SectionProse = () => new Map()

const titleCase = (name: string) =>
  name.toLowerCase().replaceAll(/(^|[\s(\-–—])([a-z])/g, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`)

/** How each file's strings are published: tokens, except for checks that read the source's words directly. */
export type TextsFor = (file: string) => SourceTexts

export function loadDatacards(
  directory: string,
  sections: SectionProse = NO_SECTIONS,
  strings?: Map<string, string>,
  textsFor: TextsFor = publishedTexts,
): LoadedDatacards {
  return completeSteps(loadDatacardsSteps(directory, sections, strings, textsFor))
}

/**
 * Tokens that record, as each is made, what the roster rules read from its words, so
 * those facts outlive the words, and a digest of the words it shows.
 */
function recording(texts: SourceTexts, facts: Map<string, TextFacts>, readings: Map<string, string>): SourceTexts {
  return (raw, transform) => {
    const published = texts(raw, transform)
    for (const token of textTokensIn(published)) {
      const key = textKey(token)
      if (readings.has(key)) continue
      const words = transformed(raw, transform)
      readings.set(key, hash('sha256', words))
      const found = textFactsOf(words)
      if (found) facts.set(key, found)
    }
    return published
  }
}

export function* loadDatacardsSteps(
  directory: string,
  sections: SectionProse = NO_SECTIONS,
  strings?: Map<string, string>,
  textsFor: TextsFor = publishedTexts,
): Steps<LoadedDatacards> {
  const textFacts = new Map<string, TextFacts>()
  const textReadings = new Map<string, string>()
  const textsOf = (file: string) => recording(textsFor(file), textFacts, textReadings)
  const factions = new Map<string, FactionContent>()
  const detachmentRules = new Map<string, Map<string, Map<string, string>>>()
  const enhancements = new Map<string, Map<string, string>>()
  const stratagems = new Map<string, Map<string, string>>()
  const stratagemNames = new Map<string, string>()
  const armyRules = new Map<string, Map<string, string>>()
  const constructionDetachments = new Map<string, ConstructionDetachment[]>()
  // Texts are compared by what they say: one card copied into two files publishes two tokens for one text.
  const remember = (into: Map<string, Map<string, string>>, key: string, text: string) => {
    const found = into.get(key) ?? new Map<string, string>()
    if (!found.has(comparableText(text))) found.set(comparableText(text), text)
    into.set(key, found)
  }
  const agreed = (candidates: ReadonlyMap<string, ReadonlyMap<string, string>>) =>
    new Map([...candidates].flatMap(([key, texts]) => (texts.size === 1 ? [[key, texts.values().next().value!] as const] : [])))
  if (!fs.existsSync(directory))
    return {
      factions,
      detachmentRules: new Map(),
      enhancements: new Map(),
      stratagems: new Map(),
      armyRules: new Map(),
      constructionDetachments: new Map(),
      textFacts,
      textReadings,
    }
  const files: (DatacardsFaction & { name: string; texts: SourceTexts })[] = []
  for (const fileName of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const file = path.join(directory, fileName)
    const parsed = readSharedJson(file, strings) as DatacardsFaction
    if (typeof parsed.name === 'string' && Array.isArray(parsed.datasheets) && Array.isArray(parsed.detachments))
      files.push({ ...(parsed as DatacardsFaction & { name: string }), texts: textsOf(file) })
    yield
  }
  // Core stratagems are read by `coreFromDatacards`, which publishes the same tokens; their facts belong with these.
  const core = path.join(directory, 'core.json')
  if (fs.existsSync(core)) {
    const parsed = readSharedJson(core, strings) as { stratagems?: unknown }
    for (const card of records(parsed, 'stratagems')) stratagemText(card, textsOf(core))
  }
  const datasheetNames = [
    ...new Set(files.flatMap((parsed) => records(parsed, 'datasheets').flatMap((entry) => localizedField(entry, 'name') ?? []))),
  ]
  for (const parsed of files) {
    yield
    const content = factionContent(parsed.name, parsed, sections, datasheetNames, parsed.texts)
    for (const key of datacardsFactionKeys(parsed.name)) factions.set(key, content)
    for (const rule of content.armyRules) remember(armyRules, routeSlug(rule.name), rule.description)
    for (const detachment of records(parsed, 'detachments')) {
      const name = localizedField(detachment, 'name')
      const points = integerField(detachment, 'detachmentPoints')
      const legacyDisposition = localizedField(detachment.forceDisposition, 'name')
      const offered = detachment.forceDispositions
      const names =
        offered === undefined
          ? legacyDisposition
            ? [legacyDisposition]
            : []
          : Array.isArray(offered)
            ? offered.map((entry) => localizedField(entry, 'name'))
            : []
      const dispositions = names.every((entry): entry is string => Boolean(entry)) ? names.map(routeSlug) : []
      const validDispositions =
        dispositions.length > 0 &&
        new Set(dispositions).size === dispositions.length &&
        (!legacyDisposition || routeSlug(legacyDisposition) === dispositions[0])
      if (!name) continue
      const overrideCandidates = new Map<string, Set<number | null>>()
      const overrides = detachment.detachmentPointsOverrides
      let globallyValid = points !== null && validDispositions && (overrides === undefined || Array.isArray(overrides))
      for (const rawOverride of Array.isArray(overrides) ? overrides : []) {
        if (!rawOverride || typeof rawOverride !== 'object') {
          globallyValid = false
          continue
        }
        const override = rawOverride as Record<string, unknown>
        const faction = stringField(override, 'faction')
        const overridden = integerField(override, 'detachmentPoints')
        const key = faction ? routeSlug(faction) : ''
        if (!key) {
          globallyValid = false
          continue
        }
        overrideCandidates.set(key, new Set([...(overrideCandidates.get(key) ?? []), overridden]))
      }
      const pointOverrides = new Map(
        [...overrideCandidates].map(
          ([faction, candidates]) => [faction, candidates.size === 1 ? candidates.values().next().value! : null] as const,
        ),
      )
      const key = routeSlug(name)
      constructionDetachments.set(key, [
        ...(constructionDetachments.get(key) ?? []),
        { name, faction: parsed.name, points, pointOverrides, dispositions, globallyValid },
      ])
    }

    for (const entry of detachmentRuleCards(parsed.rules, parsed.name, sections, parsed.texts)) {
      const rules = detachmentRules.get(routeSlug(entry.detachment)) ?? new Map<string, Map<string, string>>()
      for (const rule of entry.rules) remember(rules, rule.name, rule.description)
      detachmentRules.set(routeSlug(entry.detachment), rules)
    }
    for (const enhancement of records(parsed, 'enhancements')) {
      const name = localizedField(enhancement, 'name')
      const detachment = stringField(enhancement, 'detachment')
      const description = localizedField(enhancement, 'description')
      if (name && detachment && description) remember(enhancements, descriptionKey(detachment, name), parsed.texts(description, 'prose'))
    }
    for (const stratagem of records(parsed, 'stratagems')) {
      const name = localizedField(stratagem, 'name')
      const detachment = stringField(stratagem, 'detachment')
      const description = stratagemText(stratagem, parsed.texts)
      if (name && detachment && description) {
        const card = { name: name === name.toLowerCase() ? titleCase(name) : name, description }
        remember(stratagems, descriptionKey(detachment, name), description)
        // A card printed entirely in lower case is a slip in the file, not how the name reads.
        stratagemNames.set(descriptionKey(detachment, name), card.name)
      }
    }
  }
  return {
    factions,
    keywordRules: keywordDescriptions(directory, ['weapons', 'abilities'], ['exact', 'parameterized'], textsOf),
    detachmentRules: new Map(
      [...detachmentRules].map(([detachment, rules]) => [
        detachment,
        [...agreed(rules)].map(([name, description]) => ({ name, description })),
      ]),
    ),
    enhancements: agreed(enhancements),
    stratagems: new Map([...agreed(stratagems)].map(([key, description]) => [key, { name: stratagemNames.get(key)!, description }])),
    armyRules: agreed(armyRules),
    constructionDetachments,
    textFacts,
    textReadings,
  }
}
export function keywordAbilityDescriptions(directory: string, textsFor: TextsFor = publishedTexts) {
  return new Map(
    keywordDescriptions(directory, ['abilities'], ['exact'], textsFor).map(({ name, description }) => [joinKey(name), description]),
  )
}
function keywordDescriptions(
  directory: string,
  appliesTo: readonly string[],
  matchTypes: readonly string[],
  textsFor: TextsFor,
): RuleCard[] {
  const file = path.join(directory, 'keywords.json')
  if (!fs.existsSync(file)) return []
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { keywords?: unknown }
  const published = textsFor(file)
  const candidates = new Map<string, { name: string; texts: Set<string> }>()
  for (const entry of records({ keywords: parsed.keywords }, 'keywords')) {
    if (
      !matchTypes.includes(String(entry.matchType)) ||
      !Array.isArray(entry.appliesTo) ||
      !entry.appliesTo.some((kind) => appliesTo.includes(kind))
    )
      continue
    const name = stringField(entry, 'name')
    const description = localizedField(entry, 'descriptionLoc') ?? stringField(entry, 'description')
    if (!name || !description) continue
    const key = normalizeRuleReference(name)
    const candidate = candidates.get(key) ?? { name, texts: new Set<string>() }
    candidate.texts.add(published(description, 'prose'))
    candidates.set(key, candidate)
  }
  return [...candidates.values()].flatMap(({ name, texts }) =>
    texts.size === 1 ? [{ name, description: texts.values().next().value! }] : [],
  )
}
