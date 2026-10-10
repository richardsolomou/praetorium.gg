import type { Stratagem } from '../core/battle'
import { routeSlug } from '../core/slug'
import { type ConstructionDetachment, datacardsFactionKeys, DATACARDS_ATTRIBUTION, type FactionRestrictions } from './datacards'
import { type LoadedCards, type Mission, missionForIn, type MissionCard } from './rulesCards'
import type { DetachmentReference, DetachmentRulesDetail } from '../contracts/factions'
import type { MissionTwist } from '../contracts/missions'
import type { RuleDocument } from '../contracts/rules'
import type { Deployment, TerrainLayout, TerrainTemplate } from '../contracts/terrain'
/** Assemble rules from the available sources without guessing missing parts; preserve the source attribution required by CC BY 4.0. */
export const RULES_DATA_ATTRIBUTION = DATACARDS_ATTRIBUTION
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
/**
 * Which faction directory a player-facing slug's rules are filed under.
 *
 * One place decides it, because the rules maps are keyed by the dataset's own name for
 * a book and the rest of the app knows a faction by the name it shows a player.
 */
export const rulesFaction = (rules: Pick<LoadedRules, 'factionKeys'> | null | undefined, factionSlug: string) =>
  rules?.factionKeys?.get(factionSlug) ?? factionSlug
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
