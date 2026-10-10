import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { normalizeRuleReference } from '../core/ruleReference'
import { joinKey, titleCase } from '../shared/rulesSource'
import {
  type RuleCard,
  type SectionProse,
  type ConstructionDetachment,
  type FactionContent,
  type LoadedDatacards,
  type DatacardsFaction,
  descriptionKey,
  datacardsFactionKeys,
  unique,
  factionContent,
  detachmentRuleCards,
  prose,
  stratagemText,
  localizedField,
  records,
  stringField,
  integerField,
} from '../shared/datacards'
export * from '../shared/datacards'
const NO_SECTIONS: SectionProse = () => new Map()
export function loadDatacards(directory: string, sections: SectionProse = NO_SECTIONS): LoadedDatacards {
  const factions = new Map<string, FactionContent>()
  const detachmentRules = new Map<string, Map<string, Set<string>>>()
  const enhancements = new Map<string, Set<string>>()
  const stratagems = new Map<string, Set<string>>()
  const stratagemNames = new Map<string, string>()
  const stratagemIds = new Map<string, Map<string, RuleCard>>()
  const armyRules = new Map<string, Set<string>>()
  const constructionDetachments = new Map<string, ConstructionDetachment[]>()
  const enhancementPointCandidates = new Map<string, Set<number | null>>()
  const remember = (into: Map<string, Set<string>>, key: string, text: string) => {
    const found = into.get(key) ?? new Set<string>()
    found.add(text)
    into.set(key, found)
  }
  if (!fs.existsSync(directory))
    return {
      factions,
      detachmentRules: new Map(),
      enhancements: new Map(),
      stratagems: new Map(),
      stratagemsById: new Map(),
      armyRules: new Map(),
      constructionDetachments: new Map(),
      enhancementPoints: new Map(),
    }
  const files = fs
    .readdirSync(directory)
    .filter((entry) => entry.endsWith('.json'))
    .map((fileName) => JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8')) as DatacardsFaction)
    .filter(
      (parsed): parsed is DatacardsFaction & { name: string } =>
        typeof parsed.name === 'string' && Array.isArray(parsed.datasheets) && Array.isArray(parsed.detachments),
    )
  const datasheetNames = [
    ...new Set(files.flatMap((parsed) => records(parsed, 'datasheets').flatMap((entry) => localizedField(entry, 'name') ?? []))),
  ]
  for (const parsed of files) {
    const content = factionContent(parsed.name, parsed, sections, datasheetNames)
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

    for (const entry of detachmentRuleCards(parsed.rules, parsed.name, sections)) {
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
      if (name && detachment) {
        const key = descriptionKey(detachment, name)
        const candidates = enhancementPointCandidates.get(key) ?? new Set<number | null>()
        candidates.add(integerField(enhancement, 'cost'))
        enhancementPointCandidates.set(key, candidates)
      }
    }
    for (const stratagem of records(parsed, 'stratagems')) {
      const name = localizedField(stratagem, 'name')
      const detachment = stringField(stratagem, 'detachment')
      const description = stratagemText(stratagem)
      if (name && detachment && description) {
        const card = { name: name === name.toLowerCase() ? titleCase(name) : name, description }
        remember(stratagems, descriptionKey(detachment, name), description)
        // A card printed entirely in lower case is a slip in the file, not how the name reads.
        stratagemNames.set(descriptionKey(detachment, name), card.name)
        const id = stringField(stratagem, 'id')
        if (id) {
          const candidates = stratagemIds.get(id) ?? new Map<string, RuleCard>()
          candidates.set(JSON.stringify(card), card)
          stratagemIds.set(id, candidates)
        }
      }
    }
  }
  return {
    factions,
    keywordRules: keywordDescriptions(directory, ['weapons', 'abilities'], ['exact', 'parameterized']),
    detachmentRules: new Map(
      [...detachmentRules].map(([detachment, rules]) => [
        detachment,
        [...rules].flatMap(([name, texts]) => (texts.size === 1 ? [{ name, description: texts.values().next().value! }] : [])),
      ]),
    ),
    enhancements: unique(enhancements),
    stratagems: new Map([...unique(stratagems)].map(([key, description]) => [key, { name: stratagemNames.get(key)!, description }])),
    stratagemsById: new Map(
      [...stratagemIds].flatMap(([id, candidates]) => (candidates.size === 1 ? [[id, candidates.values().next().value!] as const] : [])),
    ),
    armyRules: unique(armyRules),
    constructionDetachments,
    enhancementPoints: new Map(
      [...enhancementPointCandidates].flatMap(([key, candidates]) => {
        const points = candidates.size === 1 ? candidates.values().next().value! : null
        return points === null ? [] : [[key, points] as const]
      }),
    ),
  }
}
export function keywordAbilityDescriptions(directory: string) {
  return new Map(keywordDescriptions(directory, ['abilities'], ['exact']).map(({ name, description }) => [joinKey(name), description]))
}
function keywordDescriptions(directory: string, appliesTo: readonly string[], matchTypes: readonly string[]): RuleCard[] {
  const file = path.join(directory, 'keywords.json')
  if (!fs.existsSync(file)) return []
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { keywords?: unknown }
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
    candidate.texts.add(prose(description))
    candidates.set(key, candidate)
  }
  return [...candidates.values()].flatMap(({ name, texts }) =>
    texts.size === 1 ? [{ name, description: texts.values().next().value! }] : [],
  )
}
