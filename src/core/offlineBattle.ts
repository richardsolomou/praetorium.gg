import { mayNameCard, sameSide, playsSide, reduceBattle, commandArmy, validate, type Command, type LoggedCommand } from './battle'
import { battleView } from './battleView'

type Players = { id: string; name: string; side: number; automated: boolean }[]
export function visibleBattleLog(players: Players, log: readonly LoggedCommand[], viewerId: string): LoggedCommand[] {
  const state = reduceBattle(
    players.map((player) => player.id),
    log,
    players.map((player) => player.side),
    players.filter((player) => player.automated).map((player) => player.id),
  )
  const hidden = new Map<string, string>()
  const hiddenSides = new Set<number>()
  for (const entry of log) {
    if (entry.command.kind !== 'select-secret') continue
    const target = commandArmy(state, entry.by, entry.command)
    if (!target || sameSide(state, viewerId, target.id)) continue
    const key = entry.command.secondary.key
    if (target.secretSecondary === key && mayNameCard(state, viewerId, target, key)) continue
    hidden.set(key, `secret-${target.side}-${entry.seq}`)
    hiddenSides.add(target.side)
  }
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') return hidden.get(value) ?? value
    if (Array.isArray(value)) return value.map(clean)
    if (!value || typeof value !== 'object') return value
    const record = value as Record<string, unknown>
    if (typeof record.key === 'string' && hidden.has(record.key)) return { key: hidden.get(record.key), name: 'Secret Mission' }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [hidden.get(key) ?? key, clean(item)]))
  }
  return log.map((entry) => {
    const command = structuredClone(entry.command)
    const actor = state.players.find((player) => player.id === entry.by)
    const target = actor ? commandArmy(state, entry.by, command) : undefined
    if (
      (command.kind === 'set-prep' || command.kind === 'attach-roster') &&
      target &&
      hiddenSides.has(target.side) &&
      !playsSide(state, viewerId, target.side)
    ) {
      if (command.kind === 'set-prep') delete command.secondaryDeck
      else if (command.prep) delete command.prep.secondaryDeck
    }
    if (command.kind === 'attach-roster' && target?.id !== viewerId) {
      delete command.roster.reminders
      delete command.roster.remindersEnabled
    }
    return { ...entry, command: clean(command) as Command }
  })
}

export function localBattleState(players: Players, log: readonly LoggedCommand[]) {
  return reduceBattle(
    players.map((player) => player.id),
    log,
    players.map((player) => player.side),
    players.filter((player) => player.automated).map((player) => player.id),
  )
}

export function localBattleView(battle: { token: string }, players: Players, log: readonly LoggedCommand[], viewerId: string) {
  return battleView(battle, players, localBattleState(players, log), viewerId)
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
  const available = player.secondaryDeck.filter((candidate) => !player.secondaries.some((secondary) => secondary.key === candidate.key))
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

export function restoreOpaqueBattleKeys(players: Players, log: readonly LoggedCommand[], command: Command): Command {
  const state = localBattleState(players, log)
  const keys = new Map<string, string>()
  for (const entry of log) {
    if (entry.command.kind !== 'select-secret') continue
    const target = commandArmy(state, entry.by, entry.command)
    if (target) keys.set(`secret-${target.side}-${entry.seq}`, entry.command.secondary.key)
  }
  const restore = (value: unknown): unknown => {
    if (typeof value === 'string') return keys.get(value) ?? value
    if (Array.isArray(value)) return value.map(restore)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]))
  }
  return restore(command) as Command
}
