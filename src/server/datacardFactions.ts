import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { uniqueBy } from '../core/collections'
import { routeSlug } from '../core/slug'
import { compareText } from '../core/text'
import { constructionDetachment, datacardsFactionKeys, type FactionContent, type LoadedDatacards } from '../shared/datacards'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'
import { joinKey } from '../core/text'
import type { DetachmentReference, DetachmentRulesDetail, LoadedFactions } from './rulesFactions'
import type { VsStratagemCard } from './vsDataStratagems'

/**
 * Whether a rules version's build has a Detachment at all, its Stratagems by its name, with each card's wording as tokens where Game Datacards prints it, and, where
 * its release lists what the Detachment's build prints, the Stratagems it does not publish by name, the Game Datacards
 * IDs of the Enhancements it lists and those it does not publish by name.
 */
export type DetachmentCards = (detachment: string) => {
  /** The rules version's build has no such Detachment. */
  absent?: true
  stratagems: (VsStratagemCard & { description: string | null })[]
  stratagemsUnlisted?: readonly string[]
  enhancements?: ReadonlySet<string>
  enhancementsUnlisted?: readonly string[]
}
import { enhancementKey, isUpgrade, withoutUpgrade } from '../shared/mfm'

export function factionsFromDatacards(datacards: LoadedDatacards, iconDirectory: string, detachmentCards: DetachmentCards): LoadedFactions {
  const factionNames = new Map<string, string>()
  const factionIcons = new Map<string, string>()
  const factionRules = new Map<string, { name: string; description: string }>()
  const factionKeys = new Map<string, string>()
  const factionParents = new Map<string, string>()
  const detachmentReferences = new Map<string, Map<string, DetachmentReference>>()
  const detachmentDetails = new Map<string, Map<string, DetachmentRulesDetail>>()
  const byDetachment = new Map<string, Map<string, Stratagem[]>>()
  const contents = [...new Set(datacards.factions.values())]
  for (const content of contents) {
    const faction = routeSlug(content.name)
    factionNames.set(faction, content.name)
    for (const key of datacardsFactionKeys(content.name)) factionKeys.set(key, faction)
    if (content.parentName) factionParents.set(faction, routeSlug(content.parentName))
    const ability = content.armyRules.find((rule) => [...content.factionAbilityNames].some((name) => joinKey(name) === joinKey(rule.name)))
    if (ability) factionRules.set(faction, ability)
  }
  for (const content of contents) {
    const faction = routeSlug(content.name)
    const parent = content.parentName ? routeSlug(content.parentName) : null
    detachmentReferences.set(faction, detachmentReferences.get(faction) ?? new Map())
    for (const name of content.detachments) {
      const listed = detachmentCards(name)
      if (listed.absent) continue
      const ownerName = content.detachmentFactions?.get(name) ?? content.name
      const owner = routeSlug(ownerName)
      for (const key of datacardsFactionKeys(ownerName)) factionKeys.set(key, owner)
      if (owner !== faction && !factionParents.has(owner)) factionParents.set(owner, faction)
      const references = detachmentReferences.get(owner) ?? new Map<string, DetachmentReference>()
      const details = detachmentDetails.get(owner) ?? new Map<string, DetachmentRulesDetail>()
      const stratagems = byDetachment.get(owner) ?? new Map<string, Stratagem[]>()
      detachmentReferences.set(owner, references)
      detachmentDetails.set(owner, details)
      byDetachment.set(owner, stratagems)
      const id = routeSlug(name)
      const construction = constructionDetachment(datacards, content.name, name, parent)
      const cards = listed.stratagems
      const sourceEnhancements = content.enhancements.get(joinKey(name)) ?? []
      const enhancements = listed.enhancements
        ? listedEnhancements(content, name, listed.enhancements, listed.enhancementsUnlisted ?? [])
        : sourceEnhancements.filter((card) => !isUpgrade(card.name))
      const upgrades = sourceEnhancements.filter((card) => isUpgrade(card.name))
      stratagems.set(
        id,
        cards.map(({ type: _type, description: _description, ...stratagem }) => stratagem),
      )
      references.set(id, {
        enhancements: enhancements.length,
        upgrades: upgrades.length,
        stratagems: cards.length,
        points: construction?.points ?? null,
        dispositions: construction?.dispositions ?? [],
      })
      details.set(id, {
        id,
        name,
        points: construction?.points ?? null,
        dispositions: construction?.dispositions ?? [],
        rules: [...(content.detachmentRules.get(joinKey(name)) ?? [])],
        enhancements: enhancements.map((card) => ({
          name: card.name,
          points: card.points,
          description: card.description,
          eligibility: card.eligibility,
        })),
        upgrades: upgrades.map((card) => ({
          name: withoutUpgrade(card.name),
          points: card.points,
          description: card.description,
        })),
        stratagems: [
          ...cards.map((card) => ({
            id: card.key,
            name: card.name,
            cp: card.cp,
            type: card.type,
            phases: card.phases ?? [],
            turn: card.turn ?? null,
            ...(card.windows ? { windows: card.windows } : {}),
            description: card.description,
          })),
          // Printed in this build but not yet published, so shown by name like any card without a summary.
          ...(listed.stratagemsUnlisted ?? []).map((unlisted) => ({
            id: `${id}.${routeSlug(unlisted)}`,
            name: unlisted,
            cp: null,
            type: null,
            phases: [],
            turn: null,
            description: null,
          })),
        ].sort((a, b) => compareText(a.name, b.name)),
      })
    }
  }
  const inherit = <T>(maps: Map<string, Map<string, T>>) => {
    for (const [child, parent] of factionParents) {
      const inherited = maps.get(parent)
      if (!inherited) continue
      const own = maps.get(child) ?? new Map<string, T>()
      for (const [name, value] of inherited) if (!own.has(name)) own.set(name, value)
      maps.set(child, own)
    }
  }
  inherit(detachmentReferences)
  inherit(detachmentDetails)
  inherit(byDetachment)
  if (fs.existsSync(iconDirectory)) {
    for (const file of fs.readdirSync(iconDirectory).filter((name) => /^[a-z0-9-]+\.svg$/.test(name))) {
      factionIcons.set(file.slice(0, -4), `data:image/svg+xml;base64,${fs.readFileSync(path.join(iconDirectory, file)).toString('base64')}`)
    }
  }
  const astartes = factionIcons.get('adeptus-astartes')
  if (astartes) factionIcons.set('space-marines', astartes)
  for (const { id, logoUrl } of SUPPLEMENTAL_FACTION_ICONS) if (!factionIcons.has(id)) factionIcons.set(id, logoUrl)
  return {
    factionNames,
    factionIcons,
    factionRules,
    factionKeys,
    factionParents,
    detachmentReferences,
    detachmentDetails,
    byDetachment,
  }
}

/**
 * The Enhancements a release lists for a Detachment, as the faction's Game Datacards cards print them wherever they file
 * them, and those it does not publish yet by name, from a card of that name or by name alone.
 */
function listedEnhancements(content: FactionContent, detachment: string, ids: ReadonlySet<string>, unlisted: readonly string[]) {
  const cards = [...content.enhancements.values()].flat().filter((card) => !isUpgrade(card.name))
  const listed = cards.filter((card) => card.ids?.some((id) => ids.has(id)))
  // An Upgrade is the Detachment's own, never an Enhancement, and a name is joined without the qualifier a card can print,
  // as the release's "Osseus Key" is the card's "Osseus Key (Aura)".
  const named = unlisted
    .filter((name) => !isUpgrade(name) && !listed.some((card) => enhancementKey(card.name) === enhancementKey(name)))
    .map(
      (name) =>
        cards.find((card) => enhancementKey(card.name) === enhancementKey(name)) ?? {
          name,
          detachment,
          points: null,
          description: null,
          eligibility: null,
        },
    )
  return uniqueBy([...listed, ...named], (card) => enhancementKey(card.name))
}
