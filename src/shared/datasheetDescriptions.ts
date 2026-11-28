import { reminderIn } from './textFacts'
import { canonicalDetachmentName } from '../core/detachmentName'
import { routeSlug } from '../core/slug'
import { ruleReferenceMatches, splitWeaponKeywords } from '../core/ruleReference'
import { rulesNamed, rulesReferencedIn } from './catalogueRules'
import { datasheetIn, detachmentAbilitiesIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { joinKey } from '../core/text'
import { cardName, DATACARDS_ATTRIBUTION } from './datacards'
import { factionContentOf } from './factionNames'
import { withoutUpgrade } from './mfm'
import { isNonMatchedPlayName, withoutFactionPrefix } from '../core/name'
import type { EnhancementEligibility } from '../contracts/factions'
import { enhancementAdmits, keywordsOf } from '../core/vsDataRoster'
import type { Definition } from '../core/vsDataConstruction'
import { vsDefinitionsOf, vsUnitIdOf } from './vsDataBuild'

/** The names, as route slugs, of the unit upgrades a faction's detachments offer. */
export function detachmentUpgradeNames(loaded: LoadedCatalogue, catalogueId: string, loadedRules: LoadedRules | null | undefined) {
  const faction = loaded.index.catalogues.get(catalogueId)
  const factionSlug = faction ? rulesFaction(loadedRules, routeSlug(faction.name)) : null
  const detachments = factionSlug ? [...(loadedRules?.detachmentDetails.get(factionSlug)?.values() ?? [])] : []
  return new Set(detachments.flatMap((detachment) => detachment.upgrades.map((upgrade) => cardName(upgrade.name))))
}

/** A datasheet shows wargear named after a detachment upgrade as that upgrade. */
export const describedAbilityKind = <Kind extends string>(ability: { kind: Kind; name: string }, upgradeNames: ReadonlySet<string>) =>
  ability.kind === 'wargear' && upgradeNames.has(cardName(ability.name)) ? ('upgrade' as const) : ability.kind

export function describeDatasheetAbilities(
  loaded: LoadedCatalogue,
  catalogueId: string,
  sheet: ReturnType<typeof datasheetIn>,
  loadedRules: LoadedRules | null | undefined,
  options: { reference?: boolean } = {},
) {
  return describeDatasheetAbilitiesWithContributions(loaded, catalogueId, sheet, loadedRules, options)?.datasheet ?? null
}

export function describeDatasheetAbilitiesWithContributions(
  loaded: LoadedCatalogue,
  catalogueId: string,
  sheet: ReturnType<typeof datasheetIn>,
  loadedRules: LoadedRules | null | undefined,
  options: { reference?: boolean } = {},
) {
  if (!sheet) return null
  const descriptions = loadedRules?.abilityDescriptions
  const faction = loaded.index.catalogues.get(catalogueId)
  const factionSlug = faction ? rulesFaction(loadedRules, routeSlug(faction.name)) : null
  const detachmentDetails = factionSlug ? [...(loadedRules?.detachmentDetails.get(factionSlug)?.values() ?? [])] : []
  const factionContent = faction ? factionContentOf(loaded, faction.name) : undefined
  const factionAbilityNames = factionContent
    ? new Set([...factionContent.armyRules.map((rule) => routeSlug(rule.name)), ...[...factionContent.factionAbilityNames].map(routeSlug)])
    : null
  const upgradeNames = detachmentUpgradeNames(loaded, catalogueId, loadedRules)
  const referenceAbilities = options.reference ? detachmentAbilitiesIn(loaded, catalogueId, sheet.id) : null
  const sourceAbilities = referenceAbilities?.abilities ?? sheet.abilities
  const visibleAbilities = sourceAbilities.filter(
    (ability) => ability.kind !== 'faction' || !factionAbilityNames || factionAbilityNames.has(routeSlug(ability.name)),
  )
  const filteredFactionAbility = visibleAbilities.length !== sourceAbilities.length
  // An army rule is printed on the datasheet by name alone. Its own faction's card is
  // asked first: the Deathwatch and the Space Marines each state Oath of Moment.
  const armyRule = (name: string) =>
    factionContent?.armyRules.find((card) => routeSlug(card.name) === routeSlug(name))?.description ??
    descriptions?.get(routeSlug(name)) ??
    null
  const supplied = visibleAbilities.some((ability) => !ability.description && armyRule(ability.name))
  const rulesContributeAbilities = visibleAbilities.some((ability) => describedAbilityKind(ability, upgradeNames) === 'upgrade')
  const describeAbility = (ability: (typeof visibleAbilities)[number]) => {
    const description =
      ability.description ??
      armyRule(ability.name) ??
      (ability.kind === 'core' && ability.source
        ? rulesNamed(loaded, [ability.name]).toSorted((left, right) => right.name.length - left.name.length)[0]?.description || null
        : null)
    const reminder = description === null ? undefined : reminderIn(description, loaded.index.textFacts)
    return {
      ...ability,
      name: withoutUpgrade(ability.name),
      kind: describedAbilityKind(ability, upgradeNames),
      description,
      ...(reminder ? { reminder } : {}),
    }
  }
  const abilities = visibleAbilities.map(describeAbility)
  const weaponAbilityNames = weaponKeywords(sheet.profiles)
  const takes = enhancementsTaken(loaded, catalogueId, sheet)
  const abilitiesByDetachment = new Map(
    referenceAbilities?.detachments.map((detachment) => [joinKey(canonicalDetachmentName(detachment.name)), detachment] as const) ?? [],
  )
  const detachments = faction
    ? detachmentDetails.map((detachment) => ({
        id: detachment.id,
        slug: routeSlug(detachment.name),
        name: detachment.name,
        rules: detachment.rules,
        abilities: (abilitiesByDetachment.get(joinKey(canonicalDetachmentName(detachment.name)))?.abilities ?? []).map(describeAbility),
        enhancements: detachment.enhancements.filter(takes),
      }))
    : []
  const describedDetachmentNames = new Set(detachments.map((detachment) => joinKey(canonicalDetachmentName(detachment.name))))
  for (const detachment of referenceAbilities?.detachments ?? []) {
    if (describedDetachmentNames.has(joinKey(canonicalDetachmentName(detachment.name)))) continue
    detachments.push({
      id: detachment.id,
      slug: routeSlug(detachment.name),
      name: detachment.name,
      rules: [],
      abilities: detachment.abilities.map(describeAbility),
      enhancements: [],
    })
  }
  const suppliedDetachmentDescriptions = detachments.some((detachment) =>
    [...detachment.rules, ...detachment.enhancements].some((entry) => entry.description),
  )
  return {
    datasheet: {
      ...sheet,
      abilities,
      keywordRules: mergeKeywordRules(
        [
          ...abilities.flatMap((ability) =>
            ability.description && weaponAbilityNames.some((name) => ruleReferenceMatches(name, ability.name))
              ? [{ name: ability.name, description: ability.description }]
              : [],
          ),
          ...rulesReferencedIn(
            loaded,
            abilities.map((ability) => ability.description),
          ),
          ...rulesNamed(
            loaded,
            abilities.filter((ability) => ability.source).map((ability) => ability.name),
          ),
          ...rulesNamed(loaded, weaponAbilityNames),
        ],
        sheet.keywordRules,
      ),
      detachments,
      attribution: supplied || suppliedDetachmentDescriptions ? (factionContent?.attribution ?? DATACARDS_ATTRIBUTION) : null,
    },
    contributions: {
      datacards: filteredFactionAbility || supplied,
      rules: rulesContributeAbilities,
    },
  }
}

/**
 * Whether the datasheet may take a Detachment's Enhancement: as the Enhancement's rule facts admit some model of the
 * datasheet's VS Data unit under that Detachment, with or without an allegiance the unit may take there (and carry the
 * wargear it needs), carrying any wargear the Enhancement needs. A datasheet VS Data does not define, or an Enhancement
 * it has no record of, is read from its Game Datacards card's wording instead. Beside VS Data's reading, so is a Warhammer
 * Legends or Crucible datasheet, which no app build prints to check VS Data's copy against, and any datasheet of an
 * earlier rules version, whose frozen maps can still name another faction's unit of the same name.
 */
function enhancementsTaken(loaded: LoadedCatalogue, catalogueId: string, sheet: NonNullable<ReturnType<typeof datasheetIn>>) {
  const definitions = vsDefinitionsOf(loaded)
  const unitId = vsUnitIdOf(loaded, catalogueId, sheet.id)
  const unit = unitId ? definitions?.get('unit', unitId) : undefined
  const card = cardEligibility(sheet)
  if (!definitions || !unit) return card
  const alsoCard = isNonMatchedPlayName(sheet.name) || Boolean(loaded.edition && !loaded.edition.default)
  const faction = loaded.vsRoster?.books[catalogueId.slice(catalogueId.indexOf('~') + 1)] ?? unit.data.faction
  const carried = [
    ...definitions.modelsOf(unit.id).flatMap((model) => Object.keys(model.data.wargear)),
    ...Object.keys(unit.data.wargear ?? {}),
    ...definitions.optionsOf(unit.id).flatMap((option) => option.data.choices),
  ]
  const reachable = new Set([...carried, ...carried.flatMap((id) => Object.keys(definitions.get('wargear', id)?.data.includes ?? {}))])
  const reachableNames = new Set([...reachable].map((id) => (definitions.get('wargear', id)?.name ?? id).toLowerCase()))
  // Every model fielded, each taking one option choice at a time, so a keyword a piece of wargear gives counts.
  const models = Object.fromEntries(definitions.modelsOf(unit.id).map((model) => [model.id, model.data.max]))
  const loadouts = [
    {},
    ...definitions.optionsOf(unit.id).flatMap((option) => option.data.choices.map((choice) => ({ [option.id]: { [choice]: 1 } }))),
  ]
  const admits = (enhancement: Definition<'enhancement'>) => {
    const { detachment } = enhancement.data
    const roster = { faction, detachments: [detachment], units: [] }
    const offered = (unit.data.allegiances ?? []).filter((offer) => !offer.detachment || offer.detachment === detachment)
    const allegiances = offered.flatMap((offer) =>
      offer.choices.filter((choice) => !offer.requires?.[choice] || reachable.has(offer.requires[choice])),
    )
    return (
      (enhancement.data.eligibility.requiredWargear ?? []).every((name) => reachableNames.has(name.toLowerCase())) &&
      [undefined, ...allegiances].some((allegiance) => {
        const picked = { unit: unit.id, size: unit.data.sizes[0], ...(allegiance ? { allegiance } : {}) }
        return loadouts.some((options) =>
          enhancementAdmits(definitions, enhancement, picked, keywordsOf(definitions, roster, { ...picked, models, options })),
        )
      })
    )
  }
  return (enhancement: { vsDataId?: string; eligibility: EnhancementEligibility | null }) => {
    const record = enhancement.vsDataId ? definitions.get('enhancement', enhancement.vsDataId) : undefined
    return record ? admits(record) || (alsoCard && card(enhancement)) : card(enhancement)
  }
}

function cardEligibility(sheet: NonNullable<ReturnType<typeof datasheetIn>>) {
  const keywords = new Set(sheet.keywords.map((keyword) => routeSlug(withoutFactionPrefix(keyword))))
  if (!keywords.has('character') || keywords.has('epic-hero')) return () => false
  const named = (keyword: string) => keywords.has(routeSlug(keyword)) || routeSlug(sheet.name) === routeSlug(keyword)
  return ({ eligibility }: { eligibility: EnhancementEligibility | null }) =>
    eligibility !== null &&
    eligibility.anyOf.some((required) => required.every(named)) &&
    eligibility.excluded.every((keyword) => !named(keyword)) &&
    (eligibility.requiredAbilities ?? []).every((name) => sheet.abilities.some((ability) => routeSlug(ability.name) === routeSlug(name))) &&
    (eligibility.requiredWargear ?? []).every((name) =>
      sheet.profiles.some((profile) => /weapons?/i.test(profile.type) && joinKey(profile.name) === joinKey(name)),
    )
}

/**
 * Every keyword the weapons on this sheet carry, printed or added: a modifier appends
 * to the characteristic rather than announcing what it added, so the whole line is read.
 */
const weaponKeywords = (profiles: NonNullable<ReturnType<typeof datasheetIn>>['profiles']) =>
  profiles.flatMap((profile) => profile.values.flatMap((value) => (value.name === 'Keywords' ? splitWeaponKeywords(value.value) : [])))

function mergeKeywordRules<T extends { name: string }>(preferred: readonly T[], fallback: readonly T[]) {
  return [...new Map([...fallback, ...preferred].map((rule) => [rule.name.toLowerCase(), rule])).values()]
}
