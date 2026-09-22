import { rulesReferencedIn } from './catalogue'
import { routeSlug } from '../core/slug'
import { describedEnhancements, mergeDetachmentRules } from './catalogueDescriptions'
import { descriptionKey } from './datacards'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { detachmentNamed, isReferenceDetachment } from './factionReferences'
import { isPreviewDetachment, previewDetachmentCards, previewDetachmentPoints } from './previewCatalogues'

export function detachmentReference(loaded: LoadedCatalogue, rules: LoadedRules, catalogueId: string, detachmentSlug: string) {
  const faction = loaded.index.catalogues.get(catalogueId)
  if (!faction) return null
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => routeSlug(candidate.name) === detachmentSlug)
  if (!option || (!isPreviewDetachment(loaded, option.id) && !isReferenceDetachment(loaded, rules, faction, option))) return null
  if (isPreviewDetachment(loaded, option.id)) {
    const cards = previewDetachmentCards(loaded, option.id)
    return {
      id: option.id,
      name: option.name,
      points: previewDetachmentPoints(loaded, option.id),
      dispositions: option.disposition ? [rules.dispositions?.get(option.disposition) ?? option.disposition] : [],
      rules: cards.rules,
      enhancements: [],
      upgrades: [],
      stratagems: cards.stratagems.map((card) => ({
        ...card,
        type: null,
        phases: [],
        turn: null,
      })),
      keywordRules: rulesReferencedIn(
        loaded,
        [...cards.rules, ...cards.stratagems].map((card) => card.description),
      ),
      attribution: 'BSData community catalogue',
    }
  }
  const detail = detachmentNamed(rules.detachmentDetails.get(rulesFaction(rules, routeSlug(faction.name))), detachmentSlug)
  if (!detail) return null
  const { catalogue: catalogueDetail, described } = describedEnhancements(loaded, catalogueId, option, detail)
  const detachmentRuleCards = mergeDetachmentRules(catalogueDetail?.rules ?? [], detail.rules)
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
