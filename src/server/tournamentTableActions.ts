import type { z } from 'zod'
import type { reopenSwissTableSchema } from '../contracts/schemas'
import { app } from './app'
import { captureBattleCommand } from './battleTelemetry'

export async function tournamentBattlefieldRules() {
  const rules = await app().rulesFor()
  if (!rules) throw new Response('battlefields are unavailable right now', { status: 503 })
  return rules
}

export async function reopenTournamentTable(owner: string, data: z.output<typeof reopenSwissTableSchema>) {
  const startedAt = performance.now()
  const { battleId, result } = await app().service.sealedEventResultsService.reopenSwissTable(
    data.token,
    data.eventToken,
    data.battleToken,
    owner,
  )
  await captureBattleCommand(owner, battleId, { kind: 'reopen-battle' }, { result }, performance.now() - startedAt, 'direct')
  if (result.outcome === 'refused') throw new Response(result.reason, { status: 409 })
  if (result.outcome === 'stale') throw new Response('the battle changed while it was being reopened, so try again', { status: 409 })
}
