import { rulesReferencedIn } from './catalogue'
import { routeSlug } from '../core/slug'
import { describedEnhancements, mergeDetachmentRules } from './catalogueDescriptions'
import { DATACARDS_ATTRIBUTION, descriptionKey } from './datacards'
import { detachmentPoints } from './detachmentPoints'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import { detachmentNamed } from './factionReferences'
import { mfmAttribution, mfmDetachmentFor, mfmEnhancementPoints } from './mfm'
import { joinKey } from './rulesSource'
import { factionContentOf } from './factionNames'

const withoutUpgrade = (name: string) => name.replace(/\s*\(upgrade\)\s*$/i, '')
const isUpgrade = (name: string) => /\(upgrade\)\s*$/i.test(name)
const specialKey = (name: string) => joinKey(name.replace(/\s*\((?:aura|upgrade)\)/gi, ''))

export function detachmentReference(loaded: LoadedCatalogue, rules: LoadedRules, catalogueId: string, detachmentSlug: string) {
  const faction = loaded.index.catalogues.get(catalogueId)
  if (!faction) return null
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => routeSlug(candidate.name) === detachmentSlug)
  if (!option) return null
  const rulesId = rulesFaction(rules, routeSlug(faction.name))
  const detail = detachmentNamed(rules.detachmentDetails.get(rulesId), option.name)
  const mfm = mfmDetachmentFor(loaded, catalogueId, option.name)
  const attribution = factionContentOf(loaded, faction.name)?.attribution
  const sourceAttribution = [attribution ? null : 'Catalogue data from BSData/wh40k-11e', mfm ? mfmAttribution(loaded.mfm) : null]
    .filter(Boolean)
    .join('. ')
  const reference = detachmentNamed(rules.detachmentReferences.get(rulesId), option.name)
  const cardEnhancements = detail?.enhancements ?? []
  const cardUpgrades = detail?.upgrades ?? []
  const enhancementsFromMfm = (mfm?.enhancements ?? [])
    .filter((entry) => !isUpgrade(entry.name) && !cardEnhancements.some((card) => specialKey(card.name) === specialKey(entry.name)))
    .map((entry) => ({ name: entry.name, points: entry.points, description: null, eligibility: null }))
  const upgradesFromMfm = (mfm?.enhancements ?? [])
    .filter((entry) => isUpgrade(entry.name) && !cardUpgrades.some((card) => specialKey(card.name) === specialKey(entry.name)))
    .map((entry) => ({ name: withoutUpgrade(entry.name), points: entry.points, description: null }))
  const allEnhancements = [...cardEnhancements, ...enhancementsFromMfm]
  const allUpgrades = [...cardUpgrades, ...upgradesFromMfm]
  const { catalogue: catalogueDetail, described } = describedEnhancements(loaded, catalogueId, option, {
    enhancements: allEnhancements,
    upgrades: allUpgrades,
  })
  const detachmentRuleCards = mergeDetachmentRules(catalogueDetail?.rules ?? [], detail?.rules ?? [])
  const enhancements = [
    ...allEnhancements.map((enhancement) => ({
      name: enhancement.name,
      points: mfm ? (mfmEnhancementPoints(mfm, enhancement.name) ?? enhancement.points) : enhancement.points,
      description: described.get(descriptionKey(option.name, enhancement.name)) ?? null,
    })),
    ...(catalogueDetail?.forcedEnhancements.filter(
      (forced) => !allEnhancements.some((enhancement) => enhancement.name.toLocaleLowerCase() === forced.name.toLocaleLowerCase()),
    ) ?? []),
  ].toSorted((left, right) => left.name.localeCompare(right.name))
  const upgrades = allUpgrades.map((upgrade) => ({
    name: upgrade.name,
    points: mfm ? (mfmEnhancementPoints(mfm, upgrade.name) ?? upgrade.points) : upgrade.points,
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
    attribution: detail ? [attribution ?? DATACARDS_ATTRIBUTION, sourceAttribution].filter(Boolean).join('. ') : sourceAttribution,
  }
}

function upgradeDescription(catalogue: string | null, card: string | null) {
  if (!catalogue) return card
  const eligibility = card?.match(/^(.+?\b(?:unit|model) only)\.(?:\s|$)/i)?.[1]
  if (!eligibility || /\b(?:unit|model) only\./i.test(catalogue)) return catalogue
  return `${eligibility}. ${catalogue}`
}
