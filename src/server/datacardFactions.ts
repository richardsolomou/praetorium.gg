import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { routeSlug } from '../core/slug'
import { compareText } from '../core/text'
import { constructionDetachment, datacardsFactionKeys, type LoadedDatacards } from './datacards'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'
import { joinKey } from '../shared/rulesSource'
import type { DetachmentReference, DetachmentRulesDetail, LoadedFactions } from './rulesFactions'

const isUpgrade = (name: string) => /\s*\(upgrade\)\s*$/i.test(name)

export function factionsFromDatacards(datacards: LoadedDatacards, iconDirectory: string): LoadedFactions {
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
    const references = new Map<string, DetachmentReference>()
    const details = new Map<string, DetachmentRulesDetail>()
    const stratagems = new Map<string, Stratagem[]>()
    for (const name of content.detachments) {
      const id = routeSlug(name)
      const construction = constructionDetachment(datacards, content.name, name, parent)
      const sourceEnhancements = content.enhancements.get(joinKey(name)) ?? []
      const enhancements = sourceEnhancements.filter((card) => !isUpgrade(card.name))
      const upgrades = sourceEnhancements.filter((card) => isUpgrade(card.name))
      const cards = content.stratagems.get(joinKey(name)) ?? []
      stratagems.set(
        id,
        cards.map((card) => ({
          key: card.id,
          name: card.name,
          cp: card.cp,
          limit: card.limit,
          ...(card.phases.length ? { phases: card.phases } : {}),
          turn: card.turn,
        })),
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
          name: card.name.replace(/\s*\(upgrade\)\s*$/i, ''),
          points: card.points,
          description: card.description,
        })),
        stratagems: cards
          .map((card) => ({
            id: card.id,
            name: card.name,
            cp: card.cp,
            type: card.type,
            phases: card.phases,
            turn: card.turn,
            description: card.description,
          }))
          .sort((a, b) => compareText(a.name, b.name)),
      })
    }
    detachmentReferences.set(faction, references)
    detachmentDetails.set(faction, details)
    if (stratagems.size) byDetachment.set(faction, stratagems)
  }
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
