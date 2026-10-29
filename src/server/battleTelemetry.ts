import type { BattleEndReason, Command, SubmitResult } from '../core/battle'
import { captureWrite } from './mutationTelemetry'

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
  await captureWrite(userId, 'battle_command_submitted', delivery, {
    battle_id: battleId,
    command: command.kind,
    outcome: result.outcome,
    ...(result.outcome === 'refused' ? { reason: result.code } : {}),
    ...(command.kind === 'set-setup-step' ? { setup_step: command.step } : {}),
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
  if (event) await captureWrite(userId, event, delivery, { battle_id: battleId })
  if (finished) await captureWrite(userId, 'battle_finished', delivery, { battle_id: battleId, reason: finished })
}
