import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { readSharedJson } from './sharedJson'
import {
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
import { type SourceTexts, comparableText, resolvedText, textKey, textTokensIn } from '../core/sourceText'
import { combatFactsOf } from '../core/combatReading'
import { textFactsOf } from '../shared/textFacts'
import { factsKey, type TextFacts } from '../core/textFacts'
import { RecentlyUsed, remember as rememberIn } from '../core/collections'
import { publishedTexts, stringsByHash } from './sourceTexts'
const NO_SECTIONS: SectionProse = () => new Map()

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
function recording(
  texts: SourceTexts,
  facts: Map<string, TextFacts>,
  readings: Map<string, string>,
  file: string,
  files: Map<string, string>,
): SourceTexts {
  return (raw, transform) => {
    const published = texts(raw, transform)
    for (const token of textTokensIn(published)) {
      const key = textKey(token)
      files.set(token.file, file)
      if (readings.has(key)) continue
      const said = transformed(raw, transform)
      readings.set(key, hash('sha256', said))
      const found = textFactsOf(said)
      if (found) facts.set(key, found)
    }
    return published
  }
}

/**
 * What every rule the cards describe decides in combat, recorded beside its tokens so a device that never holds the
 * words plays it as the server would: a lone token's facts gain it, and a rule of several, such as a stratagem's
 * sections, is recorded under all its tokens. Each reads its words only when asked, as the reading covers every placement.
 */
function recordCombat(texts: ReadonlyMap<string, string>, facts: Map<string, TextFacts>, read: (key: string) => TextFacts['combat']) {
  for (const key of texts.keys()) {
    const found = facts.get(key)
    if (found && 'combat' in found) continue
    let combat: TextFacts['combat']
    facts.set(
      key,
      Object.defineProperty({ ...found }, 'combat', {
        enumerable: true,
        get: () => (combat === undefined ? (combat = read(key)) : combat),
      }),
    )
  }
}

/** Each card rule's text by `factsKey`, the first where several print alike, for those whose words its files hold. */
function cardRuleTexts(descriptions: Iterable<string>, files: ReadonlyMap<string, string>) {
  const texts = new Map<string, string>()
  for (const text of descriptions) {
    const tokens = textTokensIn(text)
    if (!tokens.length || tokens.some((token) => !files.has(token.file))) continue
    const key = factsKey(text)
    if (!texts.has(key)) texts.set(key, text)
  }
  return texts
}

// Read back from its file when a reading is asked for, as a server holding every rules version's card words for the
// few it reads would hold far more than the readings.
const heldStrings = new RecentlyUsed<string, ReadonlyMap<string, string>>(4)
const wordsOf = (text: string, files: ReadonlyMap<string, string>) =>
  resolvedText(
    text,
    (token) => {
      const raw = rememberIn(heldStrings, files.get(token.file)!, () => stringsByHash(files.get(token.file)!)).get(token.hash)
      return raw === undefined ? null : transformed(raw, token.transform)
    },
    () => '',
  )

// A server reads a card's words itself, so only a process building the device download records the cards' readings: a
// server holding them for every rules version it loads would spend its heap on them.
let cardReadings = false

/** Records each card rule's combat reading in the cards loaded from now on, for the device download. */
export function recordCardReadings() {
  cardReadings = true
}

/** Every rules text a value holds under a `description` field, which is where the cards keep a rule's text. */
function* descriptionsIn(value: unknown): Generator<string> {
  if (value instanceof Map || value instanceof Set) for (const entry of value.values()) yield* descriptionsIn(entry)
  else if (Array.isArray(value)) for (const entry of value) yield* descriptionsIn(entry)
  else if (value && typeof value === 'object')
    for (const [field, entry] of Object.entries(value)) {
      if (field === 'description' && typeof entry === 'string') yield entry
      else yield* descriptionsIn(entry)
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
  const textFiles = new Map<string, string>()
  const textsOf = (file: string) => recording(textsFor(file), textFacts, textReadings, file, textFiles)
  const factions = new Map<string, FactionContent>()
  const detachmentRules = new Map<string, Map<string, Map<string, string>>>()
  const enhancements = new Map<string, Map<string, string>>()
  const stratagemTexts = new Map<string, string>()
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
      stratagemTexts,
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
  const core = path.join(directory, 'core.json')
  if (fs.existsSync(core)) {
    const parsed = readSharedJson(core, strings) as { stratagems?: unknown }
    for (const card of records(parsed, 'stratagems')) {
      const id = stringField(card, 'id')
      const description = stratagemText(card, textsOf(core))
      if (id && description) stratagemTexts.set(id, description)
    }
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
    for (const [id, description] of content.stratagemTexts) stratagemTexts.set(id, description)
  }
  const rulesByDetachment = new Map(
    [...detachmentRules].map(([detachment, rules]) => [
      detachment,
      [...agreed(rules)].map(([name, description]) => ({ name, description })),
    ]),
  )
  const stratagems = new Set(stratagemTexts.values())
  const ruleTexts = cardRuleTexts(
    [
      ...stratagems,
      ...[...enhancements.values(), ...armyRules.values()].flatMap((texts) => [...texts.values()]),
      ...descriptionsIn([factions, rulesByDetachment]),
    ],
    textFiles,
  )
  const combatOf = (key: string) => {
    const text = ruleTexts.get(key)
    return text === undefined ? undefined : combatFactsOf(wordsOf(text, textFiles), stratagems.has(text))
  }
  const loaded = {
    factions,
    detachmentRules: rulesByDetachment,
    enhancements: agreed(enhancements),
    stratagemTexts,
    armyRules: agreed(armyRules),
    constructionDetachments,
    textFacts,
    textReadings,
    textCombat: combatOf,
  }
  if (cardReadings) recordCombat(ruleTexts, textFacts, (key) => combatOf(key) ?? null)
  return loaded
}
