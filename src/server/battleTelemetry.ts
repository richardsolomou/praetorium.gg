import type { BattleEndReason, Command, SubmitResult } from '../core/battle'
import { app } from './app'

const lifecycleEvents: Partial<Record<Command['kind'], string>> = {
  'attach-roster': 'battle_roster_attached',
  'begin-battle': 'battle_started',
  'reopen-battle': 'battle_reopened',
}

export async function captureBattleCommand(
  userId: string,
  battleId: string,
  command: Command,
  { result, finished }: { result: SubmitResult; finished?: BattleEndReason },
  duration: number,
  delivery: 'direct' | 'sync',
) {
  await app().telemetry.capture(userId, 'battle_command_submitted', {
    battle_id: battleId,
    command: command.kind,
    outcome: result.outcome,
    ...(result.outcome === 'refused' ? { reason: result.code } : {}),
    ...(command.kind === 'set-setup-step' ? { setup_step: command.step } : {}),
    ...(command.kind === 'set-unit-formation' ? { formation: command.formation } : {}),
    // The embarks the list asked for; setup can still drop one that no longer fits.
    ...(command.kind === 'attach-roster'
      ? { listed_embark_count: command.roster.built?.units.filter((unit) => unit.startsEmbarkedIn).length ?? 0 }
      : {}),
    duration_ms: Math.round(duration),
    delivery,
  })
  if (result.outcome !== 'appended') return
  const event = lifecycleEvents[command.kind]
  if (event) await app().telemetry.capture(userId, event, { battle_id: battleId, delivery })
  if (finished) await app().telemetry.capture(userId, 'battle_finished', { battle_id: battleId, reason: finished, delivery })
}
