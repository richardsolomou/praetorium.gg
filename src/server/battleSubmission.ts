import type { Command } from '../core/battle'
import type { z } from 'zod'
import type { submitSchema } from '../contracts/schemas'
import { randomUUID } from 'node:crypto'
import { isGuestSeat } from '../core/newBattle'
import { abilityRemindersFromRosters } from '../core/reminders'
import { app } from './app'
import type { PraetoriumService } from './service'
import { captureBattleCommand } from './battleTelemetry'
import { frozenRoster, rosterForUse } from './rosterUsage'

/** A battle command from a page or an agent, with the capture both share; durable sync has its own entry point. */
export async function submitBattleCommand(
  actorId: string,
  data: z.infer<typeof submitSchema> & { workspace?: boolean },
): Promise<Omit<Awaited<ReturnType<PraetoriumService['submitWithWorkspace']>>, 'battleId'>> {
  const startedAt = performance.now()
  const command = await submittedBattleCommand(actorId, data.command)
  const instance = app()
  const { battleId, ...answer } = await instance.service[data.workspace ? 'submitWithWorkspace' : 'submit'](
    data.token,
    actorId,
    data.expectedSeq,
    command,
    await instance.rulesFor(),
  )
  // A guest is nobody's person in analytics; their browser reports its own anonymous events.
  if (!isGuestSeat(actorId)) await captureBattleCommand(actorId, battleId, command, answer, performance.now() - startedAt, 'direct')
  return answer
}

export async function submittedBattleCommand(userId: string, submitted: z.infer<typeof submitSchema>['command']): Promise<Command> {
  if (submitted.kind === 'attach-saved-roster') {
    const { snapshot } = await rosterForUse(userId, submitted.rosterId, { lent: true })
    return {
      kind: 'attach-roster',
      roster: snapshot,
      prep: null,
      painted: true,
      ...(submitted.playerId ? { playerId: submitted.playerId } : {}),
    }
  }
  if (submitted.kind === 'attach-draft-roster') {
    // An account fields what it saved, so the list it played stays in its library.
    if (!isGuestSeat(userId)) throw new Response('save the roster before fielding it', { status: 400 })
    const { draft } = submitted
    const roster = await frozenRoster(
      { ...draft, id: draft.id ?? randomUUID(), waivedRules: draft.waivedRules ?? [], remindersEnabled: draft.prep?.remindersEnabled },
      // A device on an older build still sends the per-unit alerts it kept in the draft.
      submitted.reminders ?? abilityRemindersFromRosters([{ updatedAt: 0, reminders: draft.prep?.reminders ?? [] }]),
    )
    return { kind: 'attach-roster', roster, prep: null, painted: true }
  }
  if (submitted.kind === 'attach-roster' && submitted.roster.built) {
    if (!submitted.roster.id) throw new Response('choose a saved roster', { status: 400 })
    return { ...submitted, roster: (await rosterForUse(userId, submitted.roster.id, { lent: true })).snapshot }
  }
  return submitted
}
