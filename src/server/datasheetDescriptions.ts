import { datasheetIn, rulesNamed, rulesReferencedIn } from './catalogue'
import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { findAbilityDescription, WAHAPEDIA_ATTRIBUTION } from './wahapedia'

export function describeDatasheetAbilities(
  loaded: LoadedCatalogue,
  catalogueId: string,
  sheet: ReturnType<typeof datasheetIn>,
  loadedRules: LoadedRules | null | undefined,
) {
  if (!sheet) return null
  const descriptions = loadedRules?.abilityDescriptions
  const supplied = descriptions
    ? sheet.abilities.some((ability) => !ability.description && findAbilityDescription(descriptions, ability.name))
    : false
  const abilities = sheet.abilities.map((ability) => ({
    ...ability,
    description: ability.description ?? (descriptions ? findAbilityDescription(descriptions, ability.name) : null),
  }))
  const faction = loaded.index.catalogues.get(catalogueId)
  const keywords = new Set(sheet.keywords.map((keyword) => routeSlug(keyword.replace(/^faction:\s*/i, ''))))
  const character = keywords.has('character')
  const detachments = faction
    ? [...(loadedRules?.detachmentDetails.get(rulesFaction(loadedRules, routeSlug(faction.name)))?.values() ?? [])].map((detachment) => ({
        id: detachment.id,
        name: detachment.name,
        rules: detachment.rules,
        enhancements: character
          ? detachment.enhancements.filter((enhancement) =>
              enhancement.keywordRestrictions.every((keyword) => keywords.has(routeSlug(keyword))),
            )
          : [],
      }))
    : []
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
    attribution: supplied || suppliedDetachmentDescriptions ? WAHAPEDIA_ATTRIBUTION : null,
  }
}

/**
 * Every keyword the weapons on this sheet carry, printed or added.
 *
 * The profile states them as one comma-separated characteristic, and a modifier
 * appends to that string rather than announcing what it added — so the whole line is
 * read and each name looked up.
 */
function weaponKeywords(profiles: NonNullable<ReturnType<typeof datasheetIn>>['profiles']) {
  return profiles.flatMap((profile) =>
    profile.values.flatMap((value) => (value.name === 'Keywords' ? value.value.split(',').map((keyword) => keyword.trim()) : [])),
  )
}

function mergeKeywordRules<T extends { name: string }>(preferred: readonly T[], fallback: readonly T[]) {
  return [...new Map([...fallback, ...preferred].map((rule) => [rule.name.toLocaleLowerCase(), rule])).values()]
}
