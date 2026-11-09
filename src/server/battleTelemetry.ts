import type { BattleEndReason, Command, SubmitResult } from '../core/battle'
import type { BattleView } from '../core/battleView'
import { isGuestSeat } from '../core/newBattle'
import { captureWrite } from './mutationTelemetry'

const lifecycleEvents: Partial<Record<Command['kind'], string>> = {
  'attach-roster': 'battle_roster_attached',
  'begin-battle': 'battle_started',
  'reopen-battle': 'battle_reopened',
}

/** What kind of game this is, so a solo try-out is not read as a game played between people. */
function gameKind(view: BattleView) {
  return {
    player_count: view.settings.playerCount,
    automated_seats: view.players.filter((player) => player.automated).length,
    guest_seats: view.players.filter((player) => isGuestSeat(player.id)).length,
    limit: view.settings.limit,
    manual: Boolean(view.settings.manual),
    sealed_event: view.sealedEventToken !== null,
    round: view.round,
  }
}

export async function captureBattleCommand(
  userId: string,
  battleId: string,
  command: Command,
  { result, finished, screen }: { result: SubmitResult; finished?: BattleEndReason; screen?: { view: BattleView } },
  duration: number,
  delivery: 'direct' | 'sync',
) {
  await captureWrite(userId, 'battle_command_submitted', delivery, {
    battle_id: battleId,
    command: command.kind,
    outcome: result.outcome,
    ...(result.outcome === 'refused' ? { reason: result.code } : {}),
    ...(command.kind === 'set-setup-step' || command.kind === 'set-setup-checked' ? { setup_step: command.step } : {}),
    ...(command.kind === 'set-unit-formation' ? { formation: command.formation } : {}),
    ...('missed' in command && command.missed ? { missed: true } : {}),
    // The embarks the list asked for; setup can still drop one that no longer fits.
    ...(command.kind === 'attach-roster'
      ? { listed_embark_count: command.roster.built?.units.filter((unit) => unit.startsEmbarkedIn).length ?? 0 }
      : {}),
    duration_ms: Math.round(duration),
  })
  if (result.outcome !== 'appended') return
  const event = lifecycleEvents[command.kind]
  if (!event && !finished) return
  const kind = screen ? gameKind(screen.view) : {}
  if (event) await captureWrite(userId, event, delivery, { battle_id: battleId, ...kind })
  if (finished) await captureWrite(userId, 'battle_finished', delivery, { battle_id: battleId, reason: finished, ...kind })
}
