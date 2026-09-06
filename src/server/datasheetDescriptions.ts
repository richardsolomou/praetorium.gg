import { routeSlug } from '../core/slug'
import { datasheetIn, detachmentAbilitiesIn, rulesNamed, rulesReferencedIn, weaponKeywordsOf } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { joinKey } from './rulesSource'
import { DATACARDS_ATTRIBUTION } from './datacards'
import { factionContentOf } from './factionNames'

export function describeDatasheetAbilities(
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
  const upgradeNames = new Set(detachmentDetails.flatMap((detachment) => detachment.upgrades.map((upgrade) => routeSlug(upgrade.name))))
  const referenceAbilities = options.reference ? detachmentAbilitiesIn(loaded, catalogueId, sheet.id) : null
  const visibleAbilities = (referenceAbilities?.abilities ?? sheet.abilities).filter(
    (ability) => ability.kind !== 'faction' || !factionAbilityNames || factionAbilityNames.has(routeSlug(ability.name)),
  )
  // An army rule is printed on the datasheet by name alone. Its own faction's card is
  // asked first: the Deathwatch and the Space Marines each state Oath of Moment.
  const armyRule = (name: string) =>
    factionContent?.armyRules.find((card) => routeSlug(card.name) === routeSlug(name))?.description ??
    descriptions?.get(routeSlug(name)) ??
    null
  const supplied = visibleAbilities.some((ability) => !ability.description && armyRule(ability.name))
  const describeAbility = (ability: (typeof visibleAbilities)[number]) => ({
    ...ability,
    kind: ability.kind === 'wargear' && upgradeNames.has(routeSlug(ability.name)) ? ('upgrade' as const) : ability.kind,
    description: ability.description ?? armyRule(ability.name),
  })
  const abilities = visibleAbilities.map(describeAbility)
  const keywords = new Set(sheet.keywords.map((keyword) => routeSlug(keyword.replace(/^faction:\s*/i, ''))))
  const character = keywords.has('character')
  const abilitiesByDetachment = new Map(
    referenceAbilities?.detachments.map((detachment) => [joinKey(detachment.name), detachment] as const) ?? [],
  )
  const detachments = faction
    ? detachmentDetails.map((detachment) => ({
        id: detachment.id,
        slug: routeSlug(detachment.name),
        name: detachment.name,
        rules: detachment.rules,
        abilities: (abilitiesByDetachment.get(joinKey(detachment.name))?.abilities ?? []).map(describeAbility),
        enhancements: character
          ? detachment.enhancements.filter(
              (enhancement) =>
                enhancement.keywordRestrictions !== null &&
                enhancement.keywordRestrictions.every((keyword) => keywords.has(routeSlug(keyword))),
            )
          : [],
      }))
    : []
  const describedDetachmentNames = new Set(detachments.map((detachment) => joinKey(detachment.name)))
  for (const detachment of referenceAbilities?.detachments ?? []) {
    if (describedDetachmentNames.has(joinKey(detachment.name))) continue
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
    ...sheet,
    abilities,
    keywordRules: mergeKeywordRules(
      [
        ...rulesReferencedIn(
          loaded,
          abilities.map((ability) => ability.description),
        ),
        ...rulesNamed(
          loaded,
          abilities.filter((ability) => ability.source).map((ability) => ability.name),
        ),
        ...rulesNamed(loaded, weaponKeywords(sheet.profiles)),
      ],
      sheet.keywordRules,
    ),
    detachments,
    attribution: supplied || suppliedDetachmentDescriptions ? DATACARDS_ATTRIBUTION : null,
  }
}

/**
 * Every keyword the weapons on this sheet carry, printed or added: a modifier appends
 * to the characteristic rather than announcing what it added, so the whole line is read.
 */
const weaponKeywords = (profiles: NonNullable<ReturnType<typeof datasheetIn>>['profiles']) =>
  profiles.flatMap((profile) => profile.values.flatMap((value) => (value.name === 'Keywords' ? weaponKeywordsOf(value.value) : [])))

function mergeKeywordRules<T extends { name: string }>(preferred: readonly T[], fallback: readonly T[]) {
  return [...new Map([...fallback, ...preferred].map((rule) => [rule.name.toLocaleLowerCase(), rule])).values()]
}
