export type MissionAward = {
  vp: number
  per: string | null
  mode: string | null
  max: number | null
  group: string | null
  cumulative: boolean
  criteria: string | null
  trigger: AwardTrigger
}

export type AwardTrigger = {
  timing: string | null
  phase: string | null
  playerTurn: string | null
  roundMin: number | null
  roundMax: number | null
}

export type DueCard = {
  key: string
  name: string
  category: 'primary' | 'secondary'
  awards: MissionAward[]
}

type ScoringMoment = { phase: string; round: number; rounds: number }
type ScoringCard = { key: string; name: string; category: 'primary' | 'secondary'; awards: readonly MissionAward[] }

export const appliesInMode = (award: Pick<MissionAward, 'mode'>, mode?: string) => !award.mode || !mode || award.mode === mode

export function momentsPassed(view: Pick<ScoringMoment, 'phase' | 'round' | 'rounds'>): string[] {
  if (view.phase !== 'end') return ['end-of-phase']
  return view.round >= view.rounds ? ['end-of-phase', 'end-of-turn', 'end-of-battle'] : ['end-of-phase', 'end-of-turn']
}

export function dueNow(trigger: AwardTrigger, view: ScoringMoment, yourTurn: boolean): boolean {
  if (!trigger.timing || !momentsPassed(view).includes(trigger.timing)) return false
  if (trigger.timing === 'end-of-phase' && trigger.phase && trigger.phase !== view.phase) return false
  if (trigger.playerTurn === 'your-turn' && !yourTurn) return false
  if (trigger.playerTurn === 'opponent-turn' && yourTurn) return false
  if (trigger.roundMin !== null && view.round < trigger.roundMin) return false
  if (trigger.roundMax !== null && view.round > trigger.roundMax) return false
  return true
}

export function cardsDueFromTheirTurn(round: number, cards: readonly ScoringCard[], hand: readonly string[]): DueCard[] {
  return cards
    .filter((card) => card.category === 'primary' || hand.includes(card.key))
    .map((card) => ({
      key: card.key,
      name: card.name,
      category: card.category,
      awards: card.awards.filter((award) => {
        const trigger = award.trigger
        if (trigger.timing !== 'end-of-turn') return false
        if (trigger.playerTurn !== 'opponent-turn' && trigger.playerTurn !== 'either') return false
        if (trigger.roundMin !== null && round < trigger.roundMin) return false
        if (trigger.roundMax !== null && round > trigger.roundMax) return false
        return true
      }),
    }))
    .filter((card) => card.awards.length > 0)
}

export function cardsDue(view: ScoringMoment, yourTurn: boolean, cards: readonly ScoringCard[]): DueCard[] {
  return cards
    .map((card) => ({
      key: card.key,
      name: card.name,
      category: card.category,
      awards: card.awards.filter((award) =>
        card.category === 'primary' && view.round >= view.rounds
          ? finalRoundPrimaryDue(award.trigger, view, yourTurn)
          : dueNow(award.trigger, view, yourTurn),
      ),
    }))
    .filter((card) => card.awards.length > 0)
}

function finalRoundPrimaryDue(trigger: AwardTrigger, view: ScoringMoment, yourTurn: boolean) {
  if (!trigger.timing || view.phase !== 'end' || !yourTurn) return false
  if (trigger.roundMin !== null && view.round < trigger.roundMin) return false
  if (trigger.roundMax !== null && view.round > trigger.roundMax) return false
  return true
}
