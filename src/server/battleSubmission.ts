import type { Command } from '../core/battle'
import type { z } from 'zod'
import type { submitSchema } from './schemas'
import { rosterForUse } from './rosterUsage'

export async function submittedBattleCommand(userId: string, submitted: z.infer<typeof submitSchema>['command']): Promise<Command> {
  if (submitted.kind === 'attach-saved-roster') {
    const { snapshot } = await rosterForUse(userId, submitted.rosterId)
    return {
      kind: 'attach-roster',
      roster: snapshot,
      prep: null,
      painted: true,
      ...(submitted.playerId ? { playerId: submitted.playerId } : {}),
    }
  }
  if (submitted.kind === 'attach-roster' && submitted.roster.built) {
    if (!submitted.roster.id) throw new Response('choose a saved roster', { status: 400 })
    return { ...submitted, roster: (await rosterForUse(userId, submitted.roster.id)).snapshot }
  }
  return submitted
}
