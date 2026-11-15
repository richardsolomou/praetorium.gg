import { reduceBattle, commandArmy, undrawnSecondaries, validate, type Command, type LoggedCommand } from './battle'
import { rosterWithoutUnitNotes } from './unitNotes'

type Players = { id: string; name: string; side: number; automated: boolean }[]

/** The seats spread into the arguments the battle fold, clock and timeline take. */
export function battleFoldArgs(seats: readonly { id: string; side: number; automated: boolean }[], log: readonly LoggedCommand[]) {
  return [
    seats.map((seat) => seat.id),
    log,
    seats.map((seat) => seat.side),
    seats.filter((seat) => seat.automated).map((seat) => seat.id),
  ] as const
}

export function visibleBattleLog(players: Players, log: readonly LoggedCommand[], viewerId: string): LoggedCommand[] {
  const state = localBattleState(players, log)
  return log.map((entry) => {
    if (entry.command.kind !== 'attach-roster' || commandArmy(state, entry.by, entry.command)?.id === viewerId) return entry
    const command = structuredClone(entry.command)
    delete command.roster.reminders
    delete command.roster.remindersEnabled
    command.roster = rosterWithoutUnitNotes(command.roster)
    return { ...entry, command }
  })
}

export function localBattleState(players: Players, log: readonly LoggedCommand[]) {
  return reduceBattle(...battleFoldArgs(players, log))
}

export function resolveLocalDraw(
  players: Players,
  log: readonly LoggedCommand[],
  viewerId: string,
  command: Command,
  randomIndex: (limit: number) => number,
): Command {
  if (command.kind !== 'draw-secondary' && command.kind !== 'draw-secondaries' && command.kind !== 'use-new-orders') return command
  if (command.kind === 'draw-secondaries' && command.selected) return command
  const state = localBattleState(players, log)
  const player = commandArmy(state, viewerId, command)
  if (!player?.secondaryDeck)
    throw new Error('This player’s private deck is unavailable on this device. Reconnect or continue on their device.')
  const available = undrawnSecondaries(player)
  if (!available.length) return command
  if (command.kind === 'draw-secondary' || command.kind === 'use-new-orders')
    return { ...command, secondary: available[randomIndex(available.length)]! }
  const secondaries = command.secondaries.slice(0, available.length).map(() => available.splice(randomIndex(available.length), 1)[0]!)
  return { ...command, secondaries }
}

export function appendLocalCommand(
  players: Players,
  log: readonly LoggedCommand[],
  viewerId: string,
  command: Command,
  at: number,
): LoggedCommand[] {
  const state = localBattleState(players, log)
  const refusal = validate(state, viewerId, command)
  if (refusal) throw new Error(refusal)
  return [...log, { seq: state.seq + 1, by: viewerId, command, at: Math.max(at, log.at(-1)?.at ?? 0) }]
}
