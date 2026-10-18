import type { Command } from '../core/battle'
import type { z } from 'zod'
import type { submitSchema } from '../contracts/schemas'
import { randomUUID } from 'node:crypto'
import { isGuestSeat } from '../core/newBattle'
import { frozenRoster, rosterForUse } from './rosterUsage'

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
    const roster = await frozenRoster({
      ...draft,
      id: draft.id ?? randomUUID(),
      waivedRules: draft.waivedRules ?? [],
      reminders: draft.prep?.reminders,
      remindersEnabled: draft.prep?.remindersEnabled,
    })
    return { kind: 'attach-roster', roster, prep: null, painted: true }
  }
  if (submitted.kind === 'attach-roster' && submitted.roster.built) {
    if (!submitted.roster.id) throw new Response('choose a saved roster', { status: 400 })
    return { ...submitted, roster: (await rosterForUse(userId, submitted.roster.id, { lent: true })).snapshot }
  }
  return submitted
}
