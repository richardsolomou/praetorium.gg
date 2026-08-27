import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { routeSlug } from '../core/slug'
import {
  type ConstructionDetachment,
  DATACARDS_ATTRIBUTION,
  type FactionRestrictions,
  factionRestrictions,
  type LoadedDatacards,
  loadDatacards,
} from './datacards'
import { type LoadedCards, loadCards, loadDispositions, loadMissions, type Mission, missionForIn, type MissionCard } from './rulesCards'
import { type ConstructionJoinIssue, type DetachmentReference, type DetachmentRulesDetail, loadFactions } from './rulesFactions'
import { fixedSecondaryCapsIn, type MissionTwist, twistsIn } from './missionTwists'
import { readMissionPacks } from './missionPacks'
import { rulesDirectory } from './rulesSource'
import {
  type Deployment,
  loadDeployments,
  loadTerrainLayouts,
  loadTerrainTemplates,
  type TerrainLayout,
  type TerrainTemplate,
} from './rulesTerrain'

/**
 * Everything the app knows that the community catalogues do not carry: stratagems,
 * mission cards, force dispositions and battlefields.
 *
 * The bulk of it comes from the Tabletop Developer Consortium's dataset, which is
 * licensed CC BY 4.0 — the whole reason it can be used at all. Attribution is a
 * condition of that licence rather than a courtesy, so `attribution` goes on screen
 * wherever this data does. The prose beside it — what a stratagem, enhancement or
 * detachment rule says — is Game Datacards', matched to the dataset by name.
 *
 * This module only assembles. Each source is read by the `rules*` module named after
 * it, and an absent source leaves its part of `LoadedRules` empty rather than guessed.
 */
const ATTRIBUTION = 'Stratagems and mission cards by the Tabletop Developer Consortium, CC BY 4.0'
const BATTLEMASTER_ATTRIBUTION = 'Terrain geometry provided by Battlemaster'

export type { Mission } from './rulesCards'

export type LoadedRules = {
  attribution: string
  abilityDescriptions: ReadonlyMap<string, string>
  /** Army-construction restrictions keyed by the player-facing faction slug. */
  factionRestrictions: ReadonlyMap<string, FactionRestrictions>
  /** Every name a faction answers to, against the one its rules are filed under. */
  factionKeys: Map<string, string>
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Display metadata for each detachment, with construction numbers from Game Datacards. */
  detachmentReferences: Map<string, Map<string, DetachmentReference>>
  detachmentDetails: Map<string, Map<string, DetachmentRulesDetail>>
  /** Player-facing faction names, separate from BSData's technical catalogue labels. */
  factionNames: Map<string, string>
  factionIcons: Map<string, string>
  factionRules: Map<string, { name: string; description: string }>
  /** Stratagems every army has, offered alongside whatever the detachment brings. */
  core: Stratagem[]
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
  /** Exact-name construction joins that had no unambiguous Game Datacards answer. */
  constructionJoinIssues: ConstructionJoinIssue[]
}

export function loadRules(
  directory = rulesDirectory(),
  battlemasterDirectory = path.join(path.dirname(directory), 'battlemaster'),
  iconDirectory = path.join(path.dirname(directory), 'faction-icons'),
  datacardsDirectory = path.join(path.dirname(directory), 'datacards', '11th', 'gdc'),
  /** The cards the catalogue already read, so one snapshot is parsed once. */
  loadedDatacards?: LoadedDatacards,
): LoadedRules | null {
  const core = path.join(directory, 'data', 'core')
  if (!fs.existsSync(core)) return null
  const datacards = loadedDatacards ?? loadDatacards(datacardsDirectory)
  const factions = loadFactions(core, iconDirectory, datacards)
  // Parsed once and read three ways: what each payout asks for, the twists a pack
  // offers, and the ceiling it puts on a single fixed card.
  const packs = readMissionPacks(datacardsDirectory)
  const cards: LoadedCards = loadCards(core, datacardsDirectory, packs)
  const terrainLayouts = loadTerrainLayouts(core, battlemasterDirectory)
  const dispositionDetails = loadDispositions(core)

  // The dataset is optional, and an instance without its two headline parts has
  // nothing to offer from it. Reporting that is what lets the app fall back cleanly.
  if (!factions.byDetachment.size && !cards.secondaries.length) return null

  const hasBattlemaster = terrainLayouts.some((layout) => layout.geometry)
  return {
    attribution: [ATTRIBUTION, DATACARDS_ATTRIBUTION, hasBattlemaster ? BATTLEMASTER_ATTRIBUTION : null].filter(Boolean).join('. '),
    abilityDescriptions: datacards.armyRules,
    factionRestrictions: factionRestrictions(datacards),
    factionKeys: factions.factionKeys,
    byDetachment: factions.byDetachment,
    detachmentReferences: factions.detachmentReferences,
    detachmentDetails: factions.detachmentDetails,
    factionNames: factions.factionNames,
    factionIcons: factions.factionIcons,
    factionRules: factions.factionRules,
    core: cards.core,
    coreDetails: cards.coreDetails,
    secondaries: cards.secondaries,
    primaries: cards.primaries,
    missions: loadMissions(core),
    missionTwists: twistsIn(packs),
    fixedSecondaryCaps: fixedSecondaryCapsIn(packs),
    dispositions: new Map(dispositionDetails.map((entry) => [entry.id, entry.name])),
    dispositionDetails,
    deployments: loadDeployments(core),
    terrainLayouts,
    terrainTemplates: loadTerrainTemplates(core),
    dataslate: factions.dataslate,
    constructionJoinIssues: factions.constructionJoinIssues,
  }
}

/**
 * Which faction directory a player-facing slug's rules are filed under.
 *
 * One place decides it, because the rules maps are keyed by the dataset's own name for
 * a book and the rest of the app knows a faction by the name it shows a player.
 */
export const rulesFaction = (rules: LoadedRules | null | undefined, factionSlug: string) =>
  rules?.factionKeys?.get(factionSlug) ?? factionSlug

export function hasDetachmentSemantics(
  rules: Pick<LoadedRules, 'detachmentDetails'>,
  candidate: Pick<ConstructionDetachment, 'faction' | 'name'>,
) {
  const name = routeSlug(candidate.name)
  return [...rules.detachmentDetails.values()].some((details) => [...details.values()].some((detail) => routeSlug(detail.name) === name))
}

/** The primary an army plays, derived from its disposition and the one opposing it. */
export function missionFor(
  rules: LoadedRules,
  one: string | null,
  two: string | null,
  missionPackId: string | null = null,
): Mission | null {
  const mission = missionForIn(rules.missions, one, two, missionPackId)
  // The per-card ceiling belongs to the pack rather than to the matchup, and it is
  // joined on here so that everything asking what a mission allows asks one object.
  return mission ? { ...mission, fixedSecondaryCap: rules.fixedSecondaryCaps?.get(mission.packId ?? '') ?? null } : null
}
