/**
 * A readable account of the battle, in the words a player would use about it.
 *
 * The log is already a complete record of the game, so this is a rendering of it
 * rather than anything new: nothing is stored to make a report possible. Undone
 * commands are absent, because they did not happen.
 *
 * Kept apart from `battle.ts` because none of it decides anything. Every sentence
 * here is English about a command the domain has already accepted and applied.
 */

import {
  type BattleState,
  type Command,
  emptyBattle,
  type LoggedCommand,
  type Phase,
  type PlayerId,
  type PlayerState,
  replay,
  sameSide,
} from './battle'

/** One thing that happened, in the words a player would use about it. */
type ReportEntry = { seq: number; at: number; round: number; phase: Phase; by: string; commandKind: Command['kind']; text: string }

export function battleReport(
  players: readonly { id: PlayerId; name: string }[],
  log: readonly LoggedCommand[],
  playerIds: readonly PlayerId[] = players.map((player) => player.id),
  viewerId?: PlayerId,
  playerSides?: readonly number[],
): ReportEntry[] {
  const named = new Map(players.map((player) => [player.id, player.name]))
  const state = emptyBattle(playerIds, playerSides)
  const entries: ReportEntry[] = []

  for (const { entry, before, army } of replay(state, log)) {
    const text = describe(entry.command, state, before, entry.by, army, named, viewerId)
    if (!text) continue
    entries.push({
      seq: entry.seq,
      at: entry.at,
      round: before.round || state.round,
      phase: before.phase,
      by: entry.by,
      commandKind: entry.command.kind,
      text,
    })
  }

  return entries
}

function describe(
  command: Command,
  after: BattleState,
  before: { round: number; phase: Phase; active: PlayerId | null },
  by: PlayerId,
  player: PlayerState | undefined,
  named: Map<PlayerId, string>,
  viewerId?: PlayerId,
): string | null {
  const who = named.get(by) ?? 'Someone'
  // Setting the table can be done for someone else, so a line names the army it changed.
  const targetId = 'playerId' in command && command.playerId ? command.playerId : by
  const whose = targetId === by ? 'their' : `${named.get(targetId) ?? 'another player'}’s`
  const forTarget = targetId === by ? '' : ` for ${named.get(targetId) ?? 'another player'}`

  switch (command.kind) {
    case 'configure-battle':
      return `${who} sets a ${command.limit}-point${command.solo ? ' practice' : ''} battle`
    case 'reset-setup':
      return `${who} resets battle setup`
    case 'set-setup-step':
      return null
    case 'set-attacker':
      return `${who} names ${named.get(command.attackerId) ?? 'someone'} as the attacker`
    case 'attach-roster': {
      const detachment = command.roster.built?.detachment
      return `${who} brought ${command.roster.name}${detachment && !command.roster.name.includes(detachment) ? ` (${detachment})` : ''}`
    }
    case 'set-prep': {
      const parts = [
        command.primary ? `${command.primary.name} as the primary` : null,
        player?.secondaries.length ? `${player.secondaries.map((secondary) => secondary.name).join(' and ')} as secondaries` : null,
        command.stratagems.length ? `${command.stratagems.length} stratagems` : null,
      ].filter(Boolean)
      return parts.length ? `${who} took ${parts.join(', ')}` : null
    }
    case 'set-deployment':
      // Only the id reaches here, so it is titled rather than left as a slug.
      return command.patternId ? `The battlefield is ${titled(command.patternId)}` : null
    case 'set-battlefield':
      return `The battlefield is ${titled(command.terrainLayoutId)}`
    case 'deploy-unit': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)?.name ?? 'a unit'
      if (targetId === by) return command.deployed ? `${who} put ${unit} on the table` : `${who} held ${unit} in reserve`
      return command.deployed ? `${who} puts ${whose} ${unit} on the table` : `${who} holds ${whose} ${unit} in reserve`
    }
    case 'set-unit-formation': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)?.name ?? 'a unit'
      return `${who} places ${whose} ${unit} in ${titled(command.formation)}`
    }
    case 'set-painted':
      return command.painted ? `${who} marks ${whose} army battle ready` : `${who} removes the battle ready bonus from ${whose} army`
    case 'begin-battle':
      return `The battle begins, ${named.get(command.attackerId ?? command.firstPlayerId) ?? 'someone'} attacking and ${named.get(command.firstPlayerId) ?? 'someone'} taking the first turn`
    case 'advance': {
      if (after.status === 'finished') return targetId === by ? 'The last round ends' : `${who} ends the last round${forTarget}`
      if (after.round !== before.round)
        return targetId === by ? `Round ${after.round} begins` : `${who} ends the turn${forTarget}; round ${after.round} begins`
      if (after.activePlayerId !== before.active) {
        const next = named.get(after.activePlayerId ?? '') ?? 'the other player'
        return targetId === by ? `The turn passes to ${next}` : `${who} passes ${whose} turn to ${next}`
      }
      return `${who} ends the ${before.phase} phase${forTarget}`
    }
    case 'adjust-cp':
      if (targetId === by) return command.delta > 0 ? `${who} gains ${command.delta} CP` : `${who} spends ${Math.abs(command.delta)} CP`
      return command.delta > 0 ? `${who} adds ${command.delta} CP${forTarget}` : `${who} spends ${Math.abs(command.delta)} CP${forTarget}`
    case 'discard-secondary-for-cp': {
      const secondary = player?.secondaries.find((candidate) => candidate.key === command.key)
      return `${who} discards ${secondary?.name ?? 'a secondary'} and gains 1 CP${forTarget}`
    }
    case 'resolve-tactical-hand': {
      return `${who} discards ${whose} remaining tactical hand${command.gainCpFrom ? ' and gains 1 CP' : ''}${forTarget}`
    }
    case 'use-stratagem': {
      const stratagem = player?.stratagems.find((candidate) => candidate.key === command.key)
      return stratagem
        ? `${who} uses ${targetId === by ? '' : `${whose} `}${stratagem.name} for ${command.cp ?? stratagem.cp} CP`
        : `${who} uses a stratagem${forTarget}`
    }
    case 'score':
      return `${who} scores ${command.delta} ${command.category}${forTarget}`
    case 'score-settlement': {
      const scores = command.scores.map((score) => {
        if (score.category === 'primary') return `${score.delta} primary VP`
        const secondary = player?.secondaries.find((candidate) => candidate.key === score.key)
        const hidden = player?.secretSecondary === score.key && !player.secretRevealed && !sameSide(after, viewerId ?? null, targetId)
        return `${score.delta} VP on ${hidden ? 'a secret mission' : (secondary?.name ?? 'a secondary')}`
      })
      return `${who} settles ${scores.join(', ')}${forTarget}`
    }
    case 'correct-player': {
      const target = named.get(command.playerId) ?? 'a player'
      return `${who} corrects ${target}’s ${command.resource} by ${command.delta > 0 ? '+' : ''}${command.delta}`
    }
    case 'settle-opponent-turn':
      return null
    case 'score-secondary': {
      const secondary = player?.secondaries.find((candidate) => candidate.key === command.key)
      const name =
        player?.secretSecondary === command.key && !player.secretRevealed && !sameSide(after, viewerId ?? null, targetId)
          ? 'a secret mission'
          : secondary?.name
      return `${who} scores ${command.delta} on ${name ?? 'a secondary'}${forTarget}`
    }
    case 'set-secondary-status': {
      const secondary = player?.secondaries.find((candidate) => candidate.key === command.key)
      const name = secondary?.name ?? 'a secondary'
      // Putting a card back is not giving up on it: it goes back in the deck to be drawn again, not to the bin.
      if (command.status === 'returned') return `${who} puts ${name} back in the deck${forTarget}`
      return `${who} marks ${name} ${command.status}${forTarget}`
    }
    case 'draw-secondary':
      return `${who} draws ${player?.secondaries.find((secondary) => secondary.key === command.secondary.key)?.name ?? 'a secondary'}${forTarget}`
    case 'select-secret': {
      const selected = player?.secondaries.find((secondary) => secondary.key === command.secondary.key)?.name ?? 'a secret mission'
      return sameSide(after, viewerId ?? null, targetId)
        ? `${who} selects ${selected} as a secret mission${forTarget}`
        : `${who} selects a secret mission${forTarget}`
    }
    case 'reveal-secret': {
      const secondary = player?.secondaries.find((candidate) => candidate.key === player.secretSecondary)
      return `${who} reveals ${secondary?.name ?? 'a secret mission'}${forTarget}`
    }
    case 'set-unit': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)?.name ?? 'a unit'
      if (targetId === by) return command.destroyed ? `${who} loses ${unit}` : `${who} brings ${unit} back`
      return command.destroyed ? `${who} marks ${whose} ${unit} lost` : `${who} brings ${whose} ${unit} back`
    }
    case 'wound-unit': {
      const unit = player?.units.find((candidate) => candidate.key === command.unitKey)
      const name = unit?.name ?? 'a unit'
      if (unit && unit.alive === 0) return targetId === by ? `${who} loses ${name}` : `${who} removes the last model from ${whose} ${name}`
      const count = Math.abs(command.delta)
      const models = count === 1 ? 'model' : 'models'
      if (targetId === by)
        return command.delta < 0 ? `${who} loses ${count} ${models} from ${name}` : `${who} returns ${count} ${models} to ${name}`
      return command.delta < 0
        ? `${who} removes ${count} ${models} from ${whose} ${name}`
        : `${who} returns ${count} ${models} to ${whose} ${name}`
    }
    case 'pause-clock':
    case 'resume-clock':
      return null
    case 'end-battle':
      return command.reason === 'conceded' ? `${who} concedes` : `${who} calls the battle early`
    case 'reopen-battle':
      return `${who} reopens the battle`
    default:
      return null
  }
}

/** A slug the data never gave a printed name, put into the case a sentence needs. */
const titled = (slug: string) =>
  slug
    .split('-')
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ')
