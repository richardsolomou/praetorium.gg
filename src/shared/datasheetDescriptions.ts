import { withoutFactionPrefix } from '../core/name'
import { canonicalDetachmentName } from '../core/detachmentName'
import { routeSlug } from '../core/slug'
import { ruleReferenceMatches, splitWeaponKeywords } from '../core/ruleReference'
import { rulesNamed, rulesReferencedIn } from './catalogueRules'
import { datasheetIn, detachmentAbilitiesIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { joinKey } from '../core/text'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { factionContentOf } from './factionNames'

/** The names, as route slugs, of the unit upgrades a faction's detachments offer. */
export function detachmentUpgradeNames(loaded: LoadedCatalogue, catalogueId: string, loadedRules: LoadedRules | null | undefined) {
  const faction = loaded.index.catalogues.get(catalogueId)
  const factionSlug = faction ? rulesFaction(loadedRules, routeSlug(faction.name)) : null
  const detachments = factionSlug ? [...(loadedRules?.detachmentDetails.get(factionSlug)?.values() ?? [])] : []
  return new Set(detachments.flatMap((detachment) => detachment.upgrades.map((upgrade) => routeSlug(upgrade.name))))
}

/** A datasheet shows wargear named after a detachment upgrade as that upgrade. */
export const describedAbilityKind = <Kind extends string>(ability: { kind: Kind; name: string }, upgradeNames: ReadonlySet<string>) =>
  ability.kind === 'wargear' && upgradeNames.has(routeSlug(ability.name)) ? ('upgrade' as const) : ability.kind

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
  const describeAbility = (ability: (typeof visibleAbilities)[number]) => ({
    ...ability,
    kind: describedAbilityKind(ability, upgradeNames),
    description:
      ability.description ??
      armyRule(ability.name) ??
      (ability.kind === 'core' && ability.source
        ? (rulesNamed(loaded, [ability.name]).toSorted((left, right) => right.name.length - left.name.length)[0]?.description ?? null)
        : null),
  })
  const abilities = visibleAbilities.map(describeAbility)
  const weaponAbilityNames = weaponKeywords(sheet.profiles)
  const keywords = new Set(sheet.keywords.map((keyword) => routeSlug(withoutFactionPrefix(keyword))))
  const character = keywords.has('character')
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
        enhancements: character
          ? detachment.enhancements.filter(
              (enhancement) =>
                enhancement.eligibility !== null &&
                enhancement.eligibility.anyOf.some((required) =>
                  required.every((keyword) => keywords.has(routeSlug(keyword)) || routeSlug(sheet.name) === routeSlug(keyword)),
                ) &&
                enhancement.eligibility.excluded.every(
                  (keyword) => !keywords.has(routeSlug(keyword)) && routeSlug(sheet.name) !== routeSlug(keyword),
                ) &&
                (enhancement.eligibility.requiredAbilities ?? []).every((name) =>
                  sheet.abilities.some((ability) => routeSlug(ability.name) === routeSlug(name)),
                ) &&
                (enhancement.eligibility.requiredWargear ?? []).every((name) =>
                  sheet.profiles.some((profile) => /weapons?/i.test(profile.type) && joinKey(profile.name) === joinKey(name)),
                ),
            )
          : [],
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
 * Every keyword the weapons on this sheet carry, printed or added: a modifier appends
 * to the characteristic rather than announcing what it added, so the whole line is read.
 */
const weaponKeywords = (profiles: NonNullable<ReturnType<typeof datasheetIn>>['profiles']) =>
  profiles.flatMap((profile) => profile.values.flatMap((value) => (value.name === 'Keywords' ? splitWeaponKeywords(value.value) : [])))

function mergeKeywordRules<T extends { name: string }>(preferred: readonly T[], fallback: readonly T[]) {
  return [...new Map([...fallback, ...preferred].map((rule) => [rule.name.toLowerCase(), rule])).values()]
}
