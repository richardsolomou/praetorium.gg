import { rulesReferencedIn } from './catalogueRules'
import { routeSlug } from '../core/slug'
import { describedEnhancements, mergeDetachmentRules } from './catalogueDescriptions'
import { DATACARDS_ATTRIBUTION, descriptionKey } from './datacards'
import { detachmentPoints } from './detachmentPoints'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { detachmentNamed } from './factionReferences'
import { vsMfmDetachment } from './vsDataPoints'
import {
  enhancementKey,
  fieldManualPricesEnhancement,
  isUpgrade,
  mfmAttribution,
  mfmDetachmentFor,
  mfmEnhancementPoints,
  withoutUpgrade,
} from './mfm'
import { factionContentOf } from './factionNames'
import { reminderIn } from './textFacts'

export function detachmentReference(loaded: LoadedCatalogue, rules: LoadedRules, catalogueId: string, detachmentSlug: string) {
  const faction = loaded.index.catalogues.get(catalogueId)
  if (!faction) return null
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => routeSlug(candidate.name) === detachmentSlug)
  if (!option) return null
  const rulesId = rulesFaction(rules, routeSlug(faction.name))
  const detail = detachmentNamed(rules.detachmentDetails.get(rulesId), option.name)
  const mfm = mfmDetachmentFor(loaded, catalogueId, option.name)
  const attribution = factionContentOf(loaded, faction.name)?.attribution
  const reference = detachmentNamed(rules.detachmentReferences.get(rulesId), option.name)
  const cardEnhancements = detail?.enhancements ?? []
  const cardUpgrades = detail?.upgrades ?? []
  // A priced entry is the card naming its VS Data id, as VS Data's "The Thief of Secrets" is BSData's "Thief of Secrets";
  // a field manual entry or a card no alias names, which carry no id, is joined by name.
  const carded = (entry: { name: string; vsDataId?: string }, cards: readonly { name: string; vsDataId?: string }[]) =>
    cards.some(
      (card) =>
        (entry.vsDataId !== undefined && card.vsDataId === entry.vsDataId) || enhancementKey(card.name) === enhancementKey(entry.name),
    )
  const priced = (mfm?.enhancements ?? []).map((entry) => ({
    name: entry.name,
    points: entry.points,
    ...vsDataIdOf('id' in entry && typeof entry.id === 'string' ? entry.id : undefined),
  }))
  // The price of the entry naming a card's VS Data id, else the field manual's of its name, else the card's own.
  const pointsOf = (card: { name: string; points: number | null; vsDataId?: string }) =>
    priced.find((entry) => card.vsDataId !== undefined && entry.vsDataId === card.vsDataId)?.points ??
    (mfm ? mfmEnhancementPoints(mfm, card.name) : null) ??
    card.points
  const enhancementsFromMfm = priced
    .filter((entry) => !isUpgrade(entry.name) && !carded(entry, cardEnhancements))
    .map((entry) => ({ ...entry, description: null, eligibility: null }))
  const upgradesFromMfm = priced
    .filter((entry) => isUpgrade(entry.name) && !carded(entry, cardUpgrades))
    .map((entry) => ({ ...entry, name: withoutUpgrade(entry.name), description: null }))
  const allEnhancements = [...cardEnhancements, ...enhancementsFromMfm]
  const allUpgrades = [...cardUpgrades, ...upgradesFromMfm]
  const { catalogue: catalogueDetail, described } = describedEnhancements(loaded, catalogueId, option, {
    enhancements: allEnhancements,
    upgrades: allUpgrades,
  })
  // A rule only the catalogue prints carries its BSData id, by which VS Data's alias names its record.
  const detachmentRuleCards: { name: string; description: string | null; vsDataId?: string; bsdataId?: string }[] = mergeDetachmentRules(
    catalogueDetail?.rules ?? [],
    detail?.rules ?? [],
    detail?.absentRules,
  )
  const enhancements = [
    ...allEnhancements.map((enhancement) => ({
      name: enhancement.name,
      points: pointsOf(enhancement),
      description: described.get(descriptionKey(option.name, enhancement.name)) ?? null,
      ...vsDataIdOf(enhancement.vsDataId),
    })),
    ...(catalogueDetail?.forcedEnhancements.filter(
      (forced) => !allEnhancements.some((enhancement) => enhancementKey(enhancement.name) === enhancementKey(forced.name)),
    ) ?? []),
  ].toSorted((left, right) => left.name.localeCompare(right.name))
  const fieldManualPriced =
    Boolean(mfm) &&
    (!vsMfmDetachment(loaded.vsPoints, option.id) ||
      [...allEnhancements, ...allUpgrades].some(
        (card) =>
          !priced.some((entry) => card.vsDataId !== undefined && entry.vsDataId === card.vsDataId) &&
          fieldManualPricesEnhancement(mfm!, card.name),
      ))
  const sourceAttribution = [
    attribution ? null : 'Catalogue data from BSData/wh40k-11e',
    fieldManualPriced ? mfmAttribution(loaded.mfm) : null,
  ]
    .filter(Boolean)
    .join('. ')
  const upgrades = allUpgrades.map((upgrade) => ({
    name: upgrade.name,
    points: pointsOf(upgrade),
    description: upgradeDescription(described.get(descriptionKey(option.name, upgrade.name)) ?? null, upgrade.description),
    ...vsDataIdOf(upgrade.vsDataId),
  }))
  return {
    ...detail,
    name: option.name,
    points: detachmentPoints(loaded, catalogueId, option.id, reference),
    dispositions: (detail?.dispositions ?? (option.disposition ? [option.disposition] : [])).map(
      (disposition) => rules.dispositions?.get(disposition) ?? disposition,
    ),
    // An alert for a rule suggests when VS Data says it acts, as a datasheet ability's does.
    rules: detachmentRuleCards.map((rule) => {
      const reminder = rule.description ? reminderIn(rule.description, loaded.index.textFacts) : undefined
      return reminder ? { ...rule, reminder } : rule
    }),
    enhancements,
    upgrades,
    stratagems: detail?.stratagems ?? [],
    keywordRules: rulesReferencedIn(loaded, [
      ...detachmentRuleCards.map((rule) => rule.description),
      ...enhancements.map((enhancement) => enhancement.description),
      ...upgrades.map((upgrade) => upgrade.description),
      ...(detail?.stratagems.map((stratagem) => stratagem.description) ?? []),
    ]),
    attribution: detail ? [attribution ?? DATACARDS_ATTRIBUTION, sourceAttribution].filter(Boolean).join('. ') : sourceAttribution,
  }
}

function upgradeDescription(catalogue: string | null, card: string | null) {
  if (!catalogue) return card
  const eligibility = card?.match(/^(.+?\b(?:unit|model) only)\.(?:\s|$)/i)?.[1]
  if (!eligibility || /\b(?:unit|model) only\./i.test(catalogue)) return catalogue
  return `${eligibility}. ${catalogue}`
}

const vsDataIdOf = (vsDataId: string | undefined): { vsDataId?: string } => (vsDataId ? { vsDataId } : {})
