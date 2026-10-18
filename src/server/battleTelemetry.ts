import type { Command, SubmitResult } from '../core/battle'
import { app } from './app'

const lifecycleEvents: Partial<Record<Command['kind'], string>> = {
  'attach-roster': 'battle_roster_attached',
  'begin-battle': 'battle_started',
  'end-battle': 'battle_finished',
  'reopen-battle': 'battle_reopened',
}

export async function captureBattleCommand(
  userId: string,
  command: Command,
  result: SubmitResult,
  duration: number,
  delivery: 'direct' | 'sync',
) {
  await app().telemetry.capture(userId, 'battle_command_submitted', {
    command: command.kind,
    outcome: result.outcome,
    ...(result.outcome === 'refused' ? { reason: result.code } : {}),
    ...(command.kind === 'set-setup-step' ? { setup_step: command.step } : {}),
    duration_ms: Math.round(duration),
    delivery,
  })
  if (result.outcome !== 'appended') return
  const event = lifecycleEvents[command.kind]
  if (event) await app().telemetry.capture(userId, event, { delivery })
}
