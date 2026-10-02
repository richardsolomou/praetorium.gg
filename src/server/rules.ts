import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { routeSlug } from '../core/slug'
import {
  type ConstructionDetachment,
  datacardsFactionKeys,
  DATACARDS_ATTRIBUTION,
  type FactionRestrictions,
  factionRestrictions,
  type LoadedDatacards,
  keywordAbilityDescriptions,
  loadDatacards,
} from './datacards'
import { type LoadedCards, coreFromDatacards, type Mission, missionForIn, type MissionCard } from './rulesCards'
import { type DetachmentReference, type DetachmentRulesDetail } from './rulesFactions'
import { factionsFromDatacards } from './datacardFactions'
import { dispositionsFromDatacards, missionCardsFromDatacards, missionsFromDatacards } from './datacardMissions'
import { terrainFromDatacards } from './datacardTerrain'
import { kotcTerrain } from './kotcTerrain'
import { fixedSecondaryCapsIn, type MissionTwist, twistsIn } from './missionTwists'
import { readMissionPacks } from './missionPacks'
import { type RuleDocument, loadRuleDocuments } from './rulesCore'
import { catalogueDirectory } from './catalogueIndex'
import { type Deployment, type TerrainLayout, type TerrainTemplate } from './rulesTerrain'
import { missingArmyRulesFromCatalogue } from './catalogueArmyRules'
import { joinKey } from './rulesSource'

/** Assemble rules from the available sources without guessing missing parts; preserve the source attribution required by CC BY 4.0. */
export const RULES_DATA_ATTRIBUTION = DATACARDS_ATTRIBUTION
const BATTLEMASTER_ATTRIBUTION = 'Terrain geometry provided by Battlemaster'
const KOTC_ATTRIBUTION = 'King of the Colosseum battlefield diagrams provided by Play On Tabletop'

export type { Mission } from './rulesCards'

export type LoadedRules = {
  attribution: string
  abilityDescriptions: ReadonlyMap<string, string>
  /** Army-construction restrictions keyed by the player-facing faction slug. */
  factionRestrictions: ReadonlyMap<string, FactionRestrictions>
  /** Every name a faction answers to, against the one its rules are filed under. */
  factionKeys: Map<string, string>
  /** Each child faction against the parent whose shared construction cards it may use. */
  factionParents: Map<string, string>
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Display metadata for each detachment, with construction numbers from Game Datacards. */
  detachmentReferences: Map<string, Map<string, DetachmentReference>>
  detachmentDetails: Map<string, Map<string, DetachmentRulesDetail>>
  /** Player-facing faction names, separate from BSData's technical catalogue labels. */
  factionNames: Map<string, string>
  factionIcons: Map<string, string>
  factionRules: Map<string, { name: string; description: string }>
  supplementalArmyRules: ReadonlyMap<string, { name: string; description: string }[]>
  /** Stratagems every army has, offered alongside whatever the detachment brings. */
  core: Stratagem[]
  /** The rules documents the datacards source writes out, for the pages that read them. */
  ruleDocuments: RuleDocument[]
  coreDetails: LoadedCards['coreDetails']
  secondaries: MissionCard[]
  primaries: MissionCard[]
  /** Which mission a pair of force dispositions plays, with pack-qualified keys and an unqualified legacy fallback. */
  missions: Map<string, Mission>
  /** The optional twists each pack offers, by the slug of the pack that prints them. */
  missionTwists: ReadonlyMap<string, MissionTwist[]>
  /** The most one Fixed Secondary Mission card may score all battle, by pack. */
  fixedSecondaryCaps: ReadonlyMap<string, number>
  /** The five dispositions a detachment can have, by slug. */
  dispositions: Map<string, string>
  dispositionDetails: { id: string; name: string; text: string | null }[]
  deployments: Deployment[]
  terrainLayouts: TerrainLayout[]
  terrainTemplates: TerrainTemplate[]
  /** Whatever the dataset says about how settled these numbers are. */
  dataslate: string | null
}

export type BattleMissionRules = Pick<LoadedRules, 'missions' | 'fixedSecondaryCaps'>

export type BattleReadRules = Pick<
  LoadedRules,
  | 'missions'
  | 'fixedSecondaryCaps'
  | 'primaries'
  | 'secondaries'
  | 'missionTwists'
  | 'dispositions'
  | 'dispositionDetails'
  | 'deployments'
  | 'attribution'
>

export type TerrainReadRules = Pick<LoadedRules, 'terrainLayouts' | 'terrainTemplates'>

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
  const supplementalArmyRules = new Map<string, { name: string; description: string }[]>()
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

/**
 * Which faction directory a player-facing slug's rules are filed under.
 *
 * One place decides it, because the rules maps are keyed by the dataset's own name for
 * a book and the rest of the app knows a faction by the name it shows a player.
 */
export const rulesFaction = (rules: Pick<LoadedRules, 'factionKeys'> | null | undefined, factionSlug: string) =>
  rules?.factionKeys?.get(factionSlug) ??
  (factionSlug.endsWith('-11e') ? rules?.factionKeys?.get(factionSlug.slice(0, -4)) : undefined) ??
  factionSlug

export function hasDetachmentSemantics(
  rules: Pick<LoadedRules, 'byDetachment' | 'factionKeys' | 'factionParents'>,
  candidate: Pick<ConstructionDetachment, 'faction' | 'name'>,
) {
  const id = routeSlug(candidate.name)
  const candidateFactions = new Set(
    [...datacardsFactionKeys(candidate.faction)].map((faction) => rules.factionKeys.get(faction) ?? faction),
  )
  const owners = new Set([
    ...candidateFactions,
    ...[...rules.factionParents].flatMap(([child, parent]) => (candidateFactions.has(parent) ? [child] : [])),
  ])
  return [...owners].some((owner) => rules.byDetachment.get(owner)?.has(id))
}

/** The primary an army plays, derived from its disposition and the one opposing it. */
export function missionFor(
  rules: BattleMissionRules,
  one: string | null,
  two: string | null,
  missionPackId: string | null = null,
): Mission | null {
  const mission = missionForIn(rules.missions, one, two, missionPackId)
  // The per-card ceiling belongs to the pack rather than to the matchup, and it is
  // joined on here so that everything asking what a mission allows asks one object.
  return mission ? { ...mission, fixedSecondaryCap: rules.fixedSecondaryCaps?.get(mission.packId ?? '') ?? null } : null
}
