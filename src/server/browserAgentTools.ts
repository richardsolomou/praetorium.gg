import { ACCOUNT_MCP_SCOPES } from './accountMcp'
import { createAgentTools } from './createAgentTools'
import { registerReferenceContextTools } from './referenceAgentContext'
import { app } from './app'
import { createBattleSchema, rosterVisibilitySchema, saveRosterSchema, submitSchema } from './schemas'
import { currentUser } from './playerSession'

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
  if (ACCOUNT_MCP_SCOPES[name] !== 'mcp:write' || !Object.hasOwn(ACCOUNT_MCP_SCOPES, name)) {
    throw new Response('This tool does not accept write approval.', { status: 400 })
  }
  const normalized = await browserTools(user.id).parseInput(name, input)
  const instance = app()
  let summary: string
  switch (name) {
    case 'save_roster': {
      const data = saveRosterSchema.parse(normalized)
      const saved = data.id ? await instance.service.ownRoster(user.id, data.id) : null
      summary = `${saved ? `Replace the saved choices in “${saved.name}”` : 'Save a roster'}${data.name ? ` as “${data.name}”` : ' with an automatic name'}. Visibility: ${data.visibility}.`
      break
    }
    case 'set_roster_visibility': {
      const data = rosterVisibilitySchema.parse(normalized)
      const roster = await instance.service.ownRoster(user.id, data.id)
      if (!roster) throw new Response('Roster not found.', { status: 404 })
      summary = `Make “${roster.name}” ${data.visibility}.`
      break
    }
    case 'create_battle': {
      const data = createBattleSchema.parse(normalized)
      const opponents = await instance.service.opponents(user.id)
      const ids = [...(data.allyId ? [data.allyId] : []), ...(data.opponentIds ?? (data.opponentId ? [data.opponentId] : []))]
      summary = `Start a battle with ${ids.map((id) => opponents.find((opponent) => opponent.id === id)?.name ?? id).join(', ') || 'no opponent selected'}${data.limit === undefined ? '' : ` at ${data.limit} points`}.`
      break
    }
    default: {
      const data = submitSchema.parse(normalized)
      await instance.service.userBattleId(data.token, user.id)
      const screen = await instance.service.screen(data.token, user.id, await instance.battleReadRulesFor())
      summary =
        screen?.kind === 'battle'
          ? `Record an action in ${screen.view.players.map((player) => player.name).join(' vs ')}.`
          : 'Record an action in this battle.'
    }
  }
  return { input: JSON.stringify(normalized), summary }
}
