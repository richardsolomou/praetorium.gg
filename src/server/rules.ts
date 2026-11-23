import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { uniqueBy } from '../core/collections'
import { keywordAbilityDescriptions, loadDatacardsSteps } from './datacards'
import { factionRestrictions } from '../shared/datacards'
import { factionsFromDatacards } from './datacardFactions'
import { missionTerrain } from './missionTerrain'
import { kotcTerrain } from './kotcTerrain'
import { combatPatrolTerrain } from './combatPatrolTerrain'
import { readVsDataRelease } from './vsDataSummaries'
import { vsDataMissions } from './vsDataMissions'
import { vsDataStratagems } from './vsDataStratagems'
import { vsDataIndex } from '../shared/vsData'
import { loadRuleDocuments } from './rulesCore'
import { catalogueDirectory } from './catalogueIndex'
import { type LoadedCatalogue } from '../shared/catalogueIndex'
import { missingArmyRulesFromCatalogueSteps } from './catalogueArmyRules'
import { withDefinitionTokens } from './sourceTexts'
import { joinKey } from '../core/text'
import { type LoadedRules } from '../shared/rules'
import { completeSteps, type Steps } from '../shared/steps'
export function loadRules(...args: Parameters<typeof loadRulesSteps>): LoadedRules | null {
  return completeSteps(loadRulesSteps(...args))
}

export function* loadRulesSteps(
  directory = catalogueDirectory(),
  {
    battlemasterDirectory = path.join(directory, 'battlemaster'),
    iconDirectory = fs.existsSync(path.join(directory, 'icons')) ? path.join(directory, 'icons') : path.join(directory, 'faction-icons'),
    datacardsDirectory = path.join(directory, 'datacards', '11th', 'gdc'),
    vsDataDirectory = directory,
    rulesVersion,
    catalogue,
  }: {
    battlemasterDirectory?: string
    iconDirectory?: string
    datacardsDirectory?: string
    /** The snapshot holding the VS Data releases, and the rules version whose Stratagems these rules read. */
    vsDataDirectory?: string
    rulesVersion?: string
    /** The catalogue already read, whose cards are parsed once and whose tokens the army rules read from its files take. */
    catalogue?: Pick<LoadedCatalogue, 'datacards' | 'definitions'>
  } = {},
): Steps<LoadedRules | null> {
  const datacards = catalogue?.datacards ?? (yield* loadDatacardsSteps(datacardsDirectory))
  // Missions are the current pack's whatever the rules version. Stratagems are the rules version's own; a card its
  // Game Datacards files print that its release does not carry yet plays as the base release types it.
  const vsData = readVsDataRelease(vsDataDirectory)
  const releases = [rulesVersion ? readVsDataRelease(vsDataDirectory, rulesVersion) : null, vsData].filter((release) => release !== null)
  const pools = releases.map((release) => vsDataStratagems(release.stratagems))
  const indexes = releases.map((release) => vsDataIndex(release.entries))
  // The card's wording as tokens, read through the Game Datacards IDs VS Data aliases, for the simulator and keyword links.
  const describe = (key: string) =>
    indexes
      .flatMap((index) => index.aliasesOf({ kind: 'ability', id: key }))
      .map((alias) => datacards.stratagemTexts.get(alias.replace(/^gdc\.(?:core\.)?stratagem\./, '').replaceAll('.', '-')))
      .find(Boolean) ?? null
  const printed = <Card extends { key: string }>(cards: Card[][]) =>
    uniqueBy(
      cards.flatMap((list, at) => (at ? list.filter((card) => describe(card.key)) : list)),
      (card) => card.key,
    )
  const inDetachment = (name: string) => printed(pools.map((pool) => pool.inDetachment(name)))
  const core = printed(pools.map((pool) => pool.core))
  const factions = factionsFromDatacards(datacards, iconDirectory, (name) =>
    inDetachment(name).map((card) => ({ ...card, description: describe(card.key) })),
  )
  const missing = yield* missingArmyRulesFromCatalogueSteps(path.join(directory, 'definitions'), datacards)
  const catalogueRules = catalogue?.definitions ? withDefinitionTokens(missing, catalogue.definitions.token) : missing
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
  const packs = vsData?.missionPacks ?? []
  const missions = vsDataMissions(packs, vsData?.missionActions ?? [])
  yield
  const { terrainLayouts, deployments } = missionTerrain(packs, battlemasterDirectory)
  yield
  for (const kotc of kotcTerrain(datacardsDirectory)) {
    deployments.push(kotc.deployment)
    terrainLayouts.push(kotc.layout)
  }
  const patrol = combatPatrolTerrain(packs, battlemasterDirectory)
  deployments.push(...patrol.deployments)
  terrainLayouts.push(...patrol.terrainLayouts)

  // The dataset is optional, and an instance without its two headline parts has
  // nothing to offer from it. Reporting that is what lets the app fall back cleanly.
  if (!factions.byDetachment.size && !missions.secondaries.length) return null

  const abilityDescriptions = new Map(datacards.armyRules)
  for (const rules of supplementalArmyRules.values()) {
    for (const rule of rules) {
      const key = routeSlug(rule.name)
      if (!abilityDescriptions.has(key)) abilityDescriptions.set(key, rule.description)
    }
  }
  return {
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
    core: core.map(({ type: _type, ...card }) => card),
    coreDetails: core.flatMap((card) => {
      const description = describe(card.key)
      return description ? [{ id: card.key, type: card.type, description }] : []
    }),
    ruleDocuments: loadRuleDocuments(datacardsDirectory),
    ...missions,
    deployments,
    terrainLayouts,
    terrainTemplates: [],
    dataslate: null,
  }
}
