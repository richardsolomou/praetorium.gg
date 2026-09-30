import { rulesReferencedIn } from './catalogue'
import { routeSlug } from '../core/slug'
import { describedEnhancements, mergeDetachmentRules } from './catalogueDescriptions'
import { descriptionKey } from './datacards'
import { detachmentPoints } from './detachmentPoints'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { detachmentNamed } from './factionReferences'

export function detachmentReference(loaded: LoadedCatalogue, rules: LoadedRules, catalogueId: string, detachmentSlug: string) {
  const faction = loaded.index.catalogues.get(catalogueId)
  if (!faction) return null
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => routeSlug(candidate.name) === detachmentSlug)
  if (!option) return null
  const rulesId = rulesFaction(rules, routeSlug(faction.name))
  const detail = detachmentNamed(rules.detachmentDetails.get(rulesId), option.name)
  const reference = detachmentNamed(rules.detachmentReferences.get(rulesId), option.name)
  const { catalogue: catalogueDetail, described } = describedEnhancements(loaded, catalogueId, option, detail)
  const detachmentRuleCards = mergeDetachmentRules(catalogueDetail?.rules ?? [], detail?.rules ?? [])
  const enhancements = [
    ...(detail?.enhancements.map((enhancement) => ({
      name: enhancement.name,
      points: enhancement.points,
      description: described.get(descriptionKey(option.name, enhancement.name)) ?? null,
    })) ?? []),
    ...(catalogueDetail?.forcedEnhancements.filter(
      (forced) => !detail?.enhancements.some((enhancement) => enhancement.name.toLocaleLowerCase() === forced.name.toLocaleLowerCase()),
    ) ?? []),
  ].toSorted((left, right) => left.name.localeCompare(right.name))
  const upgrades = (detail?.upgrades ?? []).map((upgrade) => ({
    name: upgrade.name,
    points: upgrade.points,
    description: upgradeDescription(described.get(descriptionKey(option.name, upgrade.name)) ?? null, upgrade.description),
  }))
  return {
    ...detail,
    name: option.name,
    points: detachmentPoints(loaded, catalogueId, option.id, reference),
    dispositions: (detail?.dispositions ?? (option.disposition ? [option.disposition] : [])).map(
      (disposition) => rules.dispositions?.get(disposition) ?? disposition,
    ),
    rules: detachmentRuleCards,
    enhancements,
    upgrades,
    stratagems: detail?.stratagems ?? [],
    keywordRules: rulesReferencedIn(loaded, [
      ...detachmentRuleCards.map((rule) => rule.description),
      ...enhancements.map((enhancement) => enhancement.description),
      ...upgrades.map((upgrade) => upgrade.description),
      ...(detail?.stratagems.map((stratagem) => stratagem.description) ?? []),
    ]),
    attribution: detail ? `${rules.attribution}. Catalogue data from BSData/wh40k-11e.` : 'Catalogue data from BSData/wh40k-11e.',
  }
}

function upgradeDescription(catalogue: string | null, card: string | null) {
  if (!catalogue) return card
  const eligibility = card?.match(/^(.+?\b(?:unit|model) only)\.(?:\s|$)/i)?.[1]
  if (!eligibility || /\b(?:unit|model) only\./i.test(catalogue)) return catalogue
  return `${eligibility}. ${catalogue}`
}
