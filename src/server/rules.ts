import fs from 'node:fs'
import path from 'node:path'
import type { Stratagem } from '../core/battle'
import { factionRestrictions, loadWahapediaDescriptions, WAHAPEDIA_ATTRIBUTION } from './wahapedia'
import { type LoadedCards, loadCards, loadDispositions, loadMissions, type Mission, missionForIn, type MissionCard } from './rulesCards'
import { loadCompositions, type LoadedWeapon, loadWeapons, type UnitComposition } from './rulesDatasheets'
import { type DetachmentReference, type DetachmentRulesDetail, loadFactions } from './rulesFactions'
import { joinKey, rulesDirectory } from './rulesSource'
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
 * mission cards, force dispositions, battlefields, and what a datasheet says a unit is
 * built from.
 *
 * The bulk of it comes from the Tabletop Developer Consortium's dataset, which is
 * licensed CC BY 4.0 — the whole reason it can be used at all. Attribution is a
 * condition of that licence rather than a courtesy, so `attribution` goes on screen
 * wherever this data does.
 *
 * This module only assembles. Each source is read by the `rules*` module named after
 * it, and an absent source leaves its part of `LoadedRules` empty rather than guessed.
 */
const ATTRIBUTION = 'Stratagems and mission cards by the Tabletop Developer Consortium, CC BY 4.0'
const BATTLEMASTER_ATTRIBUTION = 'Terrain geometry provided by Battlemaster'

export type { Mission } from './rulesCards'
export type { LoadedWeapon, UnitComposition } from './rulesDatasheets'

export type LoadedRules = {
  attribution: string
  abilityDescriptions: ReadonlyMap<string, string>
  /** Army-construction restrictions keyed by the player-facing faction slug. */
  factionRestrictions: ReturnType<typeof factionRestrictions>
  /** Every name a faction answers to, against the one its rules are filed under. */
  factionKeys: Map<string, string>
  /** Faction slug then detachment slug, so a chosen detachment maps straight to its six. */
  byDetachment: Map<string, Map<string, Stratagem[]>>
  /** Display metadata for each detachment, from the same licensed source as its stratagems. */
  detachmentReferences: Map<string, Map<string, DetachmentReference>>
  detachmentDetails: Map<string, Map<string, DetachmentRulesDetail>>
  /** Player-facing faction names, separate from BSData's technical catalogue labels. */
  factionNames: Map<string, string>
  factionIcons: Map<string, string>
  factionRules: Map<string, { name: string; description: string }>
  /** Stratagems every army has, offered alongside whatever the detachment brings. */
  core: Stratagem[]
  secondaries: MissionCard[]
  primaries: MissionCard[]
  /** Which mission a pair of force dispositions plays, with pack-qualified keys and an unqualified legacy fallback. */
  missions: Map<string, Mission>
  /** The five dispositions a detachment can have, by slug. */
  dispositions: Map<string, string>
  dispositionDetails: { id: string; name: string; text: string | null }[]
  deployments: Deployment[]
  terrainLayouts: TerrainLayout[]
  terrainTemplates: TerrainTemplate[]
  /**
   * The kinds of model each datasheet is built from, keyed by the slug the product
   * already routes datasheets by.
   */
  compositions: ReadonlyMap<string, UnitComposition>
  /** Weapons by id, so a composition's ids can be shown as profiles. */
  weapons: ReadonlyMap<string, LoadedWeapon>
  /** Whatever the dataset says about how settled these numbers are. */
  dataslate: string | null
}

export function loadRules(
  directory = rulesDirectory(),
  wahapediaDirectory = path.join(path.dirname(directory), 'wahapedia'),
  battlemasterDirectory = path.join(path.dirname(directory), 'battlemaster'),
  iconDirectory = path.join(path.dirname(directory), 'faction-icons'),
  datacardsDirectory = path.join(path.dirname(directory), 'datacards', '11th', 'gdc'),
): LoadedRules | null {
  const core = path.join(directory, 'data', 'core')
  if (!fs.existsSync(core)) return null
  const wahapedia = loadWahapediaDescriptions(wahapediaDirectory)

  // Weapons first: a composition holds ids, and only they say what those ids are.
  const { weapons, names } = loadWeapons(core)
  const compositions = loadCompositions(core, names)
  const factions = loadFactions(core, iconDirectory, wahapedia)
  const cards: LoadedCards = loadCards(core, datacardsDirectory)
  const terrainLayouts = loadTerrainLayouts(core, battlemasterDirectory)
  const dispositionDetails = loadDispositions(core)

  // The dataset is optional, and an instance without its two headline parts has
  // nothing to offer from it. Reporting that is what lets the app fall back cleanly.
  if (!factions.byDetachment.size && !cards.secondaries.length) return null

  const hasBattlemaster = terrainLayouts.some((layout) => layout.geometry)
  return {
    attribution: [ATTRIBUTION, wahapedia ? WAHAPEDIA_ATTRIBUTION : null, hasBattlemaster ? BATTLEMASTER_ATTRIBUTION : null]
      .filter(Boolean)
      .join('. '),
    abilityDescriptions: wahapedia?.abilities ?? new Map(),
    factionRestrictions: factionRestrictions(wahapedia?.abilities ?? new Map()),
    factionKeys: factions.factionKeys,
    byDetachment: factions.byDetachment,
    detachmentReferences: factions.detachmentReferences,
    detachmentDetails: factions.detachmentDetails,
    factionNames: factions.factionNames,
    factionIcons: factions.factionIcons,
    factionRules: factions.factionRules,
    core: cards.core,
    secondaries: cards.secondaries,
    primaries: cards.primaries,
    missions: loadMissions(core),
    dispositions: new Map(dispositionDetails.map((entry) => [entry.id, entry.name])),
    dispositionDetails,
    deployments: loadDeployments(core),
    terrainLayouts,
    terrainTemplates: loadTerrainTemplates(core),
    compositions,
    weapons,
    dataslate: factions.dataslate,
  }
}

/**
 * Which faction directory a player-facing slug's rules are filed under.
 *
 * One place decides it, because the rules maps are keyed by the dataset's own name for
 * a book and the rest of the app knows a faction by the name it shows a player.
 */
export const rulesFaction = (rules: LoadedRules | null | undefined, factionSlug: string) =>
  rules?.factionKeys.get(factionSlug) ?? factionSlug

/**
 * The kinds of model a datasheet is built from, or nothing when the data is silent.
 *
 * Takes the datasheet's name or its slug: either folds to the same key, which is what
 * lets an accented name find a source that spells it without one.
 */
export function compositionOf(rules: LoadedRules | null, nameOrSlug: string): UnitComposition | null {
  return rules?.compositions?.get(joinKey(nameOrSlug)) ?? null
}

/** The primary an army plays, derived from its disposition and the one opposing it. */
export function missionFor(
  rules: LoadedRules,
  one: string | null,
  two: string | null,
  missionPackId: string | null = null,
): Mission | null {
  return missionForIn(rules.missions, one, two, missionPackId)
}
