import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { DATACARDS_ATTRIBUTION, factionRestrictions, type LoadedDatacards, keywordAbilityDescriptions, loadDatacards } from './datacards'
import { type LoadedCards, coreFromDatacards } from './rulesCards'
import { factionsFromDatacards } from './datacardFactions'
import { dispositionsFromDatacards, missionCardsFromDatacards, missionsFromDatacards } from './datacardMissions'
import { terrainFromDatacards } from './datacardTerrain'
import { kotcTerrain } from './kotcTerrain'
import { fixedSecondaryCapsIn, twistsIn } from './missionTwists'
import { readMissionPacks } from './missionPacks'
import { loadRuleDocuments } from './rulesCore'
import { catalogueDirectory } from './catalogueIndex'
import { missingArmyRulesFromCatalogue } from './catalogueArmyRules'
import { joinKey } from '../shared/rulesSource'
import { type LoadedRules } from '../shared/rules'
export * from '../shared/rules'
const BATTLEMASTER_ATTRIBUTION = 'Terrain geometry provided by Battlemaster'
const KOTC_ATTRIBUTION = 'King of the Colosseum battlefield diagrams provided by Play On Tabletop'
export function loadRules(
  directory = catalogueDirectory(),
  battlemasterDirectory = path.join(directory, 'battlemaster'),
  iconDirectory = fs.existsSync(path.join(directory, 'icons')) ? path.join(directory, 'icons') : path.join(directory, 'faction-icons'),
  datacardsDirectory = path.join(directory, 'datacards', '11th', 'gdc'),
  /** The cards the catalogue already read, so one snapshot is parsed once. */
  loadedDatacards?: LoadedDatacards,
): LoadedRules | null {
  const datacards = loadedDatacards ?? loadDatacards(datacardsDirectory)
  const factions = factionsFromDatacards(datacards, iconDirectory)
  const catalogueRules = missingArmyRulesFromCatalogue(path.join(directory, 'definitions'), datacards)
  const keywordRules = keywordAbilityDescriptions(datacardsDirectory)
  const supplementalArmyRules = new Map(catalogueRules)
  for (const content of new Set(datacards.factions.values())) {
    const faction = routeSlug(content.name)
    const sourceRules = catalogueRules.get(faction) ?? []
    const keywordMissing = [...content.factionAbilityNames].flatMap((name) => {
      if (content.armyRules.some((rule) => routeSlug(rule.name) === routeSlug(name))) return []
      const description = keywordRules.get(joinKey(name))
      return description ? [{ name, description }] : []
    })
    const preferred = new Set(keywordMissing.map((rule) => routeSlug(rule.name)))
    const selected = [...keywordMissing, ...sourceRules.filter((rule) => !preferred.has(routeSlug(rule.name)))]
    if (selected.length) supplementalArmyRules.set(faction, selected)
  }
  // Parsed once and read three ways: what each payout asks for, the twists a pack
  // offers, and the ceiling it puts on a single fixed card.
  const packs = readMissionPacks(datacardsDirectory)
  const cards: LoadedCards = { ...coreFromDatacards(datacardsDirectory), ...missionCardsFromDatacards(packs) }
  const { terrainLayouts, deployments } = terrainFromDatacards(packs, battlemasterDirectory)
  const kotc = kotcTerrain(datacardsDirectory)
  if (kotc) {
    deployments.push(kotc.deployment)
    terrainLayouts.push(kotc.layout)
  }
  const dispositionDetails = dispositionsFromDatacards(packs)

  // The dataset is optional, and an instance without its two headline parts has
  // nothing to offer from it. Reporting that is what lets the app fall back cleanly.
  if (!factions.byDetachment.size && !cards.secondaries.length) return null

  const hasBattlemaster = terrainLayouts.some((layout) => layout.geometry)
  const abilityDescriptions = new Map(datacards.armyRules)
  for (const rules of supplementalArmyRules.values()) {
    for (const rule of rules) {
      const key = routeSlug(rule.name)
      if (!abilityDescriptions.has(key)) abilityDescriptions.set(key, rule.description)
    }
  }
  return {
    attribution: [
      DATACARDS_ATTRIBUTION,
      hasBattlemaster ? BATTLEMASTER_ATTRIBUTION : null,
      kotc ? KOTC_ATTRIBUTION : null,
      catalogueRules.size ? 'Army rules provided by BSData' : null,
    ]
      .filter(Boolean)
      .join('. '),
    abilityDescriptions,
    factionRestrictions: factionRestrictions(datacards),
    factionKeys: factions.factionKeys,
    factionParents: factions.factionParents,
    byDetachment: factions.byDetachment,
    detachmentReferences: factions.detachmentReferences,
    detachmentDetails: factions.detachmentDetails,
    factionNames: factions.factionNames,
    factionIcons: factions.factionIcons,
    factionRules: factions.factionRules,
    supplementalArmyRules,
    core: cards.core,
    coreDetails: cards.coreDetails,
    ruleDocuments: loadRuleDocuments(datacardsDirectory),
    secondaries: cards.secondaries,
    primaries: cards.primaries,
    missions: missionsFromDatacards(packs),
    missionTwists: twistsIn(packs),
    fixedSecondaryCaps: fixedSecondaryCapsIn(packs),
    dispositions: new Map(dispositionDetails.map((entry) => [entry.id, entry.name])),
    dispositionDetails,
    deployments,
    terrainLayouts,
    terrainTemplates: [],
    dataslate: null,
  }
}
