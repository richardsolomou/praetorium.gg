import type { z } from 'zod'
import { app } from './app'
import { cachedRosterAssessmentsFor, heldRosterAssessments } from './rosterPrices'
import type { playedArmiesSchema } from '../contracts/schemas'
import { matchesRosterAssessment, rosterAssessmentFilterActive } from '../core/rosterDiscovery'
import { againstFamilies, discoveryScope, inDiscoveryScope } from '../core/rosterDiscoveryScope'
import { matchesPlayedArmy, playedArmyFilterActive, type PlayedArmy } from '../core/playedArmies'
import { copiedArmy } from '../core/rosterCopies'
import { byId } from '../core/collections'

/**
 * Armies from finished battles anyone may watch, newest first, with their player and whether the
 * rules version they were fielded under fields them with today's data. Picks stay on the server.
 */
export async function playedArmiesPage(viewerId: string | null, { before, ...filter }: z.infer<typeof playedArmiesSchema>) {
  const instance = app()
  const [factionIndex, battleFactions] = await Promise.all([instance.factionIndexFor(), instance.battleFactionsFor()])
  const factions = factionIndex?.factions ?? []
  if (!discoveryScope(filter, factions)) return { armies: [], nextCursor: null }
  const indexed = byId(factions)
  const played = filter.against ? { ...filter, against: againstFamilies(filter.against, factions) } : filter
  const now = Date.now()
  // Most armies were priced by an earlier read under this catalogue, so only the rest have their battles' logs read for picks.
  const assess = async (armies: PlayedArmy[]) => {
    const priceable = armies.map((army) => ({ id: `${army.battle}:${army.player.id}`, updatedAt: army.playedAt }))
    const held = await heldRosterAssessments(priceable)
    const unpriced = armies.filter((_, index) => !held[index])
    const fielded = await instance.service.battleFeedService.playedArmyPicks(unpriced)
    const priced = await cachedRosterAssessmentsFor(
      unpriced.map((army, index) => ({
        ...copiedArmy({ ...army, picks: fielded[index]!.picks, playedAt: fielded[index]!.fieldedAt ?? army.playedAt }),
        id: `${army.battle}:${army.player.id}`,
        updatedAt: army.playedAt,
        optionalRules: [],
        borrowedDetachmentId: null,
      })),
    )
    let next = 0
    return held.map((assessment) => assessment ?? priced[next++]!)
  }
  const page = await instance.service.battleFeedService.playedArmies(
    viewerId,
    before ?? undefined,
    battleFactions,
    playedArmyFilterActive(filter)
      ? async (armies) => {
          const fit = armies.filter(
            (army) =>
              inDiscoveryScope(army.copied, filter, indexed) &&
              matchesPlayedArmy(army, played, now, (indexed.get(army.catalogueId) ?? indexed.get(army.copied.catalogueId))?.displayName),
          )
          if (!rosterAssessmentFilterActive(filter)) return fit
          const assessments = await assess(fit)
          return fit.filter((_, index) =>
            matchesRosterAssessment(filter, { points: assessments[index]!.points, problem: assessments[index]!.verdict.problem }),
          )
        }
      : undefined,
  )
  const assessments = await assess(page.armies)
  return {
    armies: page.armies.map(({ copied: _copied, ...army }, index) => ({
      ...army,
      points: assessments[index]!.points,
      problem: assessments[index]!.verdict.problem,
    })),
    nextCursor: page.nextCursor,
  }
}
