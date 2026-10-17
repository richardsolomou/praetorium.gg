import type { z } from 'zod'
import type { missionAwardSchema } from './commands'

export type MissionAward = z.infer<typeof missionAwardSchema>

export type AwardTrigger = MissionAward['trigger']

export type DueCard = {
  key: string
  name: string
  category: 'primary' | 'secondary'
  awards: MissionAward[]
  awardIndexes: number[]
}

type ScoringMoment = { phase: string; round: number; rounds: number; endOfBattle?: boolean }
type ScoringCard = { key: string; name: string; category: 'primary' | 'secondary'; awards: readonly MissionAward[] }

function dueCard(card: ScoringCard, eligible: (award: MissionAward) => boolean): DueCard {
  const awardIndexes = card.awards.flatMap((award, index) => (eligible(award) ? [index] : []))
  return { key: card.key, name: card.name, category: card.category, awards: awardIndexes.map((index) => card.awards[index]!), awardIndexes }
}

export const appliesInMode = (award: Pick<MissionAward, 'mode'>, mode?: string) =>
  !award.mode || award.mode === 'standard' || !mode || award.mode === mode

export function momentsPassed(view: ScoringMoment): string[] {
  if (view.phase !== 'end') return ['end-of-phase']
  return view.endOfBattle ? ['end-of-phase', 'end-of-turn', 'end-of-battle'] : ['end-of-phase', 'end-of-turn']
}

export function dueNow(trigger: AwardTrigger, view: ScoringMoment, yourTurn: boolean): boolean {
  if (!trigger.timing || !momentsPassed(view).includes(trigger.timing === 'end-of-turn-or-final-round' ? 'end-of-turn' : trigger.timing))
    return false
  if (trigger.timing === 'end-of-phase' && trigger.phase && trigger.phase !== view.phase) return false
  if (trigger.playerTurn === 'your-turn' && !yourTurn) return false
  if (trigger.playerTurn === 'opponent-turn' && yourTurn) return false
  if (trigger.roundMin !== null && view.round < trigger.roundMin) return false
  if (trigger.roundMax !== null && view.round > trigger.roundMax) return false
  return true
}

export function cardsDueFromTheirTurn(
  round: number,
  rounds: number,
  cards: readonly ScoringCard[],
  hand: readonly string[],
  endOfBattle = false,
  mode?: string,
): DueCard[] {
  return cards
    .filter((card) => card.category === 'primary' || hand.includes(card.key))
    .map((card) =>
      dueCard(card, (award) => {
        if (award.trigger.timing === 'end-of-battle')
          return appliesInMode(award, mode) && dueNow(award.trigger, { phase: 'end', round, rounds, endOfBattle }, false)
        if (card.category === 'primary' && round >= rounds) return false
        const trigger = award.trigger
        if (trigger.timing !== 'end-of-turn' && trigger.timing !== 'end-of-turn-or-final-round') return false
        if (trigger.playerTurn !== 'opponent-turn' && trigger.playerTurn !== 'either') return false
        if (trigger.roundMin !== null && round < trigger.roundMin) return false
        if (trigger.roundMax !== null && round > trigger.roundMax) return false
        return true
      }),
    )
    .filter((card) => card.awards.length > 0)
}

export function cardsDue(
  view: ScoringMoment,
  yourTurn: boolean,
  cards: readonly ScoringCard[],
  finalRoundFallbackKeys: readonly string[] = [],
  mode?: string,
): DueCard[] {
  return cards
    .map((card) =>
      dueCard(card, (award) => {
        if (award.trigger.timing === 'end-of-battle' && !appliesInMode(award, mode)) return false
        if (card.category === 'primary' && view.round >= view.rounds && award.trigger.timing !== 'end-of-battle')
          return finalRoundPrimaryDue(award.trigger, view, yourTurn)
        if (
          award.trigger.timing === 'end-of-turn-or-final-round' &&
          yourTurn &&
          view.phase === 'end' &&
          view.round === view.rounds &&
          finalRoundFallbackKeys.includes(card.key)
        )
          return true
        return dueNow(award.trigger, view, yourTurn)
      }),
    )
    .filter((card) => card.awards.length > 0)
}

export function awardTotal(award: Pick<MissionAward, 'vp' | 'max' | 'per'>, times: number): number {
  const raw = award.per ? award.vp * times : award.vp * Math.min(times, 1)
  return award.max === null ? raw : Math.min(raw, award.max)
}

export function finalAwardTotal(
  awards: readonly MissionAward[],
  claims: readonly number[],
  view: ScoringMoment,
  yourTurn: boolean,
  mode: string,
): number | null {
  if (claims.length !== awards.length || claims.length > 20) return null
  const groups = new Set<string>()
  let total = 0
  for (const [index, count] of claims.entries()) {
    const award = awards[index]!
    if (!Number.isInteger(count) || count < 0 || count > 100) return null
    if (!count) continue
    if (
      award.trigger.timing !== 'end-of-battle' ||
      !dueNow(award.trigger, view, yourTurn) ||
      !appliesInMode(award, mode) ||
      ((!award.per || award.group !== null) && count !== 1)
    )
      return null
    if (award.group && groups.has(award.group)) return null
    if (award.group) groups.add(award.group)
    total += awardTotal(award, count)
  }
  return total
}

function finalRoundPrimaryDue(trigger: AwardTrigger, view: ScoringMoment, yourTurn: boolean) {
  if (!trigger.timing || view.phase !== 'end' || !yourTurn) return false
  if (trigger.roundMin !== null && view.round < trigger.roundMin) return false
  if (trigger.roundMax !== null && view.round > trigger.roundMax) return false
  return true
}
