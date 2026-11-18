import type { WatchBattle } from '../../src/contracts/watchBattle'
import { APP_URL } from './navigation'

/** What the Lock Screen shows of a battle the player is seated in, the Live Activity's content state on iOS. */
export type BattleActivity = {
  battleId: string
  url: string
  state: {
    round: number
    rounds: number
    phase: string
    activeSide: number | null
    paused: boolean
    turnStartedAt: number | null
    turnElapsedMs: number
    finished: boolean
    updatedAt: number
    sides: { index: number; name: string; yours: boolean; vp: number; cp: number }[]
  }
}

/** ActivityKit refuses content over 4 KB, and the Lock Screen has room for a short name only. */
const NAME_LENGTH = 40

/** The Lock Screen's battle, or null when it should show none: no battle, or one only watched from the stands. */
export function battleActivity(snapshot: WatchBattle | null): BattleActivity | null {
  if (!snapshot?.sides.some((side) => side.yours)) return null
  return {
    battleId: snapshot.battleId,
    url: new URL(`/battles/${encodeURIComponent(snapshot.battleId)}`, APP_URL).href,
    state: {
      round: snapshot.round,
      rounds: snapshot.rounds,
      phase: snapshot.phase,
      activeSide: snapshot.activeSide,
      paused: snapshot.paused,
      turnStartedAt: snapshot.turnRunning ? snapshot.updatedAt - snapshot.turnElapsedMs : null,
      turnElapsedMs: snapshot.turnElapsedMs,
      finished: snapshot.status === 'finished',
      updatedAt: snapshot.updatedAt,
      sides: snapshot.sides.map(({ index, name, yours, vp, cp }) => ({
        index,
        name: name.length > NAME_LENGTH ? `${name.slice(0, NAME_LENGTH - 1)}…` : name,
        yours,
        vp,
        cp,
      })),
    },
  }
}

/** The ongoing Android notification's two lines, which say what the iOS Live Activity draws. */
export function battleNotificationText({ state }: BattleActivity) {
  const active = state.sides.find((side) => side.index === state.activeSide)
  const phase = state.phase === 'end' ? 'End of turn' : `${state.phase[0]?.toUpperCase()}${state.phase.slice(1)}`
  const turn = active ? (active.yours ? 'Your turn' : "Opponent's turn") : null
  return {
    // A collapsed notification shows one line of title, so it carries only what changes turn to turn.
    title: [`Round ${state.round}`, state.paused ? 'Paused' : phase, turn].filter(Boolean).join(' · '),
    body: state.sides.map((side) => `${side.yours ? 'You' : 'Opponent'} ${side.vp} VP, ${side.cp} CP`).join('  ·  '),
  }
}
