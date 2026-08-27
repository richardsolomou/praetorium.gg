import { rulesReferencedIn } from './catalogue'
import { routeSlug } from '../core/slug'
import { describedEnhancements } from './catalogueDescriptions'
import { descriptionKey } from './datacards'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { detachmentNamed, isReferenceDetachment } from './factionReferences'

export function detachmentReference(loaded: LoadedCatalogue, rules: LoadedRules, catalogueId: string, detachmentSlug: string) {
  const faction = loaded.index.catalogues.get(catalogueId)
  if (!faction) return null
  const detail = detachmentNamed(rules.detachmentDetails.get(rulesFaction(rules, routeSlug(faction.name))), detachmentSlug)
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => routeSlug(candidate.name) === detachmentSlug)
  if (!detail || !option || !isReferenceDetachment(loaded, rules, faction, option)) return null
  const { catalogue: catalogueDetail, described } = describedEnhancements(loaded, catalogueId, option, detail)
  const detachmentRuleCards = mergeDetachmentRules(catalogueDetail?.rule ?? null, detail.rules)
  const enhancements = [
    ...detail.enhancements.map((enhancement) => ({
      name: enhancement.name,
      points: enhancement.points,
      description: described.get(descriptionKey(option.name, enhancement.name)) ?? null,
    })),
    ...(catalogueDetail?.forcedEnhancements.filter(
      (forced) => !detail.enhancements.some((enhancement) => enhancement.name.toLocaleLowerCase() === forced.name.toLocaleLowerCase()),
    ) ?? []),
  ].toSorted((left, right) => left.name.localeCompare(right.name))
  const upgrades = detail.upgrades.map((upgrade) => ({
    name: upgrade.name,
    points: upgrade.points,
    description: described.get(descriptionKey(option.name, upgrade.name)) ?? null,
  }))
  return {
    ...detail,
    dispositions: detail.dispositions.map((disposition) => rules.dispositions?.get(disposition) ?? disposition),
    rules: detachmentRuleCards,
    enhancements,
    upgrades,
    keywordRules: rulesReferencedIn(loaded, [
      ...detachmentRuleCards.map((rule) => rule.description),
      ...enhancements.map((enhancement) => enhancement.description),
      ...upgrades.map((upgrade) => upgrade.description),
      ...detail.stratagems.map((stratagem) => stratagem.description),
    ]),
    attribution: rules.attribution,
  }
}

function mergeDetachmentRules(
  catalogueRule: { name: string; description: string | null } | null,
  rules: readonly { name: string; description: string }[],
) {
  if (rules.length || !catalogueRule) return rules
  return [catalogueRule]
}
