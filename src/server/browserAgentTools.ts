import { z } from 'zod'
import { ACCOUNT_MCP_SCOPES } from './accountMcp'
import { createAgentTools } from './createAgentTools'
import { registerReferenceContextTools } from './referenceAgentContext'
import { app } from './app'
import {
  createBattleSchema,
  rosterArchiveSchema,
  rosterIdSchema,
  rosterVisibilitySchema,
  type saveRosterSchema,
  type submitSchema,
} from '../contracts/schemas'
import { currentUser } from './playerSession'
import { readEvent } from './organisedPlayTools'

function browserTools(userId: string | null) {
  const tools = createAgentTools(userId)
  registerReferenceContextTools(tools)
  return tools
}

export async function browserAgentDescriptors() {
  const user = await currentUser()
  return browserTools(null)
    .descriptors(ACCOUNT_MCP_SCOPES)
    .filter((tool) => !tool.account || (user && !user.impersonatedBy))
    .map((tool) => ({
      ...tool,
      description: tool.account
        ? tool.description.replace(/ Requires mcp:(?:read|write)\./, ' Uses the signed-in account.') +
          (tool.readOnly ? '' : ' Requires the player to approve the proposed change on the page; do not approve it yourself.')
        : tool.description,
    }))
}

export async function executeBrowserAgentTool(name: string, input: unknown, expectedUserId: string | null) {
  const account = Object.hasOwn(ACCOUNT_MCP_SCOPES, name)
  const user = account ? await currentUser() : null
  if (account && (!user || user.id !== expectedUserId || user.impersonatedBy)) {
    throw new Response('Your account changed. Ask again after signing in.', { status: 401 })
  }
  return browserTools(user?.id ?? null).execute(name, input)
}

export async function prepareBrowserAgentWrite(name: string, input: unknown, expectedUserId: string | null) {
  const user = await currentUser()
  if (!user || user.id !== expectedUserId || user.impersonatedBy) {
    throw new Response('Your account changed. Ask again after signing in.', { status: 401 })
  }
  if (ACCOUNT_MCP_SCOPES[name] !== 'mcp:write') {
    throw new Response('This tool does not accept write approval.', { status: 400 })
  }
  const normalized = await browserTools(user.id).parseInput(name, input)
  const instance = app()
  let summary: string
  switch (name) {
    case 'save_roster': {
      const data = normalized as z.output<typeof saveRosterSchema>
      const saved = data.id ? await instance.service.sealedEventService.ownRoster(user.id, data.id) : null
      summary = `${saved ? `Replace the saved choices in “${saved.name}”` : 'Save a roster'}${data.name ? ` as “${data.name}”` : ' with an automatic name'}. Visibility: ${data.visibility}.`
      break
    }
    case 'set_roster_visibility': {
      const data = rosterVisibilitySchema.parse(normalized)
      const roster = await instance.service.sealedEventService.ownRoster(user.id, data.id)
      if (!roster) throw new Response('Roster not found.', { status: 404 })
      summary = `Make “${roster.name}” ${data.visibility}.`
      break
    }
    case 'delete_roster':
    case 'set_roster_archived': {
      const data = rosterArchiveSchema.partial({ archived: true }).parse(normalized)
      const roster = await instance.service.sealedEventService.ownRoster(user.id, data.id)
      if (!roster) throw new Response('Roster not found.', { status: 404 })
      summary =
        name === 'delete_roster' ? `Permanently delete “${roster.name}”.` : `${data.archived ? 'Archive' : 'Restore'} “${roster.name}”.`
      break
    }
    case 'copy_roster': {
      const data = rosterIdSchema.extend({ variant: z.boolean() }).parse(normalized)
      const access = await instance.service.rosterService.rosterAccess(data.id, user.id)
      if (!access) throw new Response('Roster not found.', { status: 404 })
      summary = `Save a ${data.variant ? 'variant' : 'copy'} of “${access.roster.name}” to your rosters.`
      break
    }
    case 'create_battle': {
      const data = createBattleSchema.parse(normalized)
      const opponents = await instance.service.socialService.opponents(user.id)
      const ids = [...(data.allyId ? [data.allyId] : []), ...(data.opponentIds ?? (data.opponentId ? [data.opponentId] : []))]
      summary = `Start a battle with ${ids.map((id) => opponents.find((opponent) => opponent.id === id)?.name ?? id).join(', ') || 'no opponent selected'}${data.limit === undefined ? '' : ` at ${data.limit} points`}.`
      break
    }
    case 'delete_battle': {
      const { token } = normalized as { token: string }
      const { screen } = await instance.service.seatedBattle(token, user.id)
      summary = `Permanently delete ${screen.view.players.map((player) => player.name).join(' vs ')} for everyone in it.`
      break
    }
    case 'submit_battle_action': {
      const data = normalized as Pick<z.output<typeof submitSchema>, 'token'> & { command: { kind: string } }
      const { screen } = await instance.service.seatedBattle(data.token, user.id)
      summary = `Record ${data.command.kind} in ${screen.view.players.map((player) => player.name).join(' vs ')}.`
      break
    }
    case 'join_group':
    case 'join_league': {
      const { token } = normalized as { token: string }
      const group = await instance.service.groupService.group(token, user.id)
      if (!group) throw new Response('Group not found.', { status: 404 })
      summary = name === 'join_group' ? `Join the group “${group.name}”.` : `Join the league in “${group.name}”.`
      break
    }
    case 'join_event':
    case 'submit_event_roster':
    case 'check_in_event':
    case 'start_event_battle':
    case 'report_table_result': {
      const data = normalized as {
        token: string
        eventToken?: string
        rosterId?: string
        checkedIn?: boolean
        yourScore?: number
        opponentScore?: number
      }
      const sealedEvent = await readEvent(data.token, data.eventToken, user.id)
      const event = { name: sealedEvent.tournament?.name ?? 'this hidden-list game' }
      const roster = data.rosterId ? await instance.service.sealedEventService.ownRoster(user.id, data.rosterId) : null
      if (data.rosterId && !roster) throw new Response('Roster not found.', { status: 404 })
      summary =
        name === 'join_event'
          ? `Enter “${event.name}”.`
          : name === 'submit_event_roster'
            ? `Seal “${roster!.name}” as your list for “${event.name}”.`
            : name === 'check_in_event'
              ? `${data.checkedIn === false ? 'Undo your check-in for' : 'Check in for'} “${event.name}”.`
              : name === 'start_event_battle'
                ? `Start your battle in “${event.name}”.`
                : `Report ${data.yourScore}–${data.opponentScore} (you first) for your table in “${event.name}”.`
      break
    }
    default:
      summary = `Run ${name}.`
  }
  // Execution validates the original arguments again; migrated output can lose its folded rules version.
  return { input: JSON.stringify(input), summary }
}
