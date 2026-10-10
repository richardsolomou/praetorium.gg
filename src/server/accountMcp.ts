import type { AgentTools } from './agentTools'
import { app } from './app'
import { submittedBattleCommand } from './battleSubmission'
import { saveOwnedRoster } from './saveOwnedRoster'
import {
  battlesPageSchema,
  createBattleSchema,
  rosterIdSchema,
  rosterVisibilitySchema,
  saveRosterSchema,
  submitSchema,
  tokenSchema,
} from '../contracts/schemas'

export const ACCOUNT_MCP_SCOPES: Record<string, 'mcp:read' | 'mcp:write'> = {
  list_my_rosters: 'mcp:read',
  get_my_roster: 'mcp:read',
  list_my_battles: 'mcp:read',
  get_my_battle: 'mcp:read',
  save_roster: 'mcp:write',
  set_roster_visibility: 'mcp:write',
  create_battle: 'mcp:write',
  submit_battle_action: 'mcp:write',
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const

function structured(result: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }
}

async function resultOf(work: () => Promise<Record<string, unknown>>) {
  try {
    return structured(await work())
  } catch (error) {
    if (error instanceof Response && error.status < 500) {
      return { content: [{ type: 'text' as const, text: await error.text() }], isError: true as const }
    }
    throw error
  }
}

export function registerAccountMcpTools(server: AgentTools, userId: string | null) {
  const owner = () => {
    if (!userId) throw new Response('Sign in to use this tool.', { status: 401 })
    return userId
  }

  server.registerTool(
    'list_my_rosters',
    {
      title: 'List my saved rosters',
      description: 'Lists the rosters saved to the signed-in Praetorium account. Requires mcp:read.',
      inputSchema: {},
      annotations: READ,
    },
    () => resultOf(async () => ({ rosters: await app().service.savedRosterSummaries(owner()) })),
  )
  server.registerTool(
    'get_my_roster',
    {
      title: 'Read my saved roster',
      description: 'Returns the saved choices for one roster owned by the signed-in player. Requires mcp:read.',
      inputSchema: rosterIdSchema.shape,
      annotations: READ,
    },
    ({ id }) =>
      resultOf(async () => {
        const roster = await app().service.ownRoster(owner(), id)
        if (!roster) throw new Response('Roster not found.', { status: 404 })
        return { roster }
      }),
  )
  server.registerTool(
    'list_my_battles',
    {
      title: 'List my battles',
      description: 'Lists up to 25 battles with a cursor for the next page. Requires mcp:read.',
      inputSchema: battlesPageSchema.shape,
      annotations: READ,
    },
    ({ before }) =>
      resultOf(async () => {
        const instance = app()
        const [rules, factions] = await Promise.all([instance.battleMissionRulesFor(), instance.factionIndexFor()])
        return instance.service.battles(owner(), rules, { limit: 25, before: before ?? undefined }, factions?.factions ?? [])
      }),
  )
  server.registerTool(
    'get_my_battle',
    {
      title: 'Read one of my battles',
      description: 'Returns the current seated view of a battle for the signed-in player. Requires mcp:read.',
      inputSchema: tokenSchema.shape,
      annotations: READ,
    },
    ({ token }) =>
      resultOf(async () => {
        const instance = app()
        await instance.service.userBattleId(token, owner())
        return { battle: await instance.service.screen(token, owner(), await instance.battleReadRulesFor()) }
      }),
  )
  server.registerTool(
    'save_roster',
    {
      title: 'Create or edit my roster',
      description: 'Saves a complete roster. Pass its id to edit an owned roster; omit id to create one. Requires mcp:write.',
      inputSchema: saveRosterSchema.shape,
      annotations: WRITE,
    },
    (data) =>
      resultOf(async () => {
        const { id, updatedAt } = await saveOwnedRoster(owner(), data)
        return { id, updatedAt }
      }),
  )
  server.registerTool(
    'set_roster_visibility',
    {
      title: 'Change my roster visibility',
      description: 'Changes the visibility of an owned roster. Requires mcp:write.',
      inputSchema: rosterVisibilitySchema.shape,
      annotations: WRITE,
    },
    ({ id, visibility }) =>
      resultOf(async () => {
        await app().service.setRosterVisibility(owner(), id, visibility)
        return { id, visibility }
      }),
  )
  server.registerTool(
    'create_battle',
    {
      title: 'Create a battle',
      description: 'Creates a battle with named player seats, using the same rules as the site. Requires mcp:write.',
      inputSchema: createBattleSchema,
      annotations: WRITE,
    },
    (data) => resultOf(async () => ({ battle: await app().service.createBattle(owner(), data) })),
  )
  server.registerTool(
    'submit_battle_action',
    {
      title: 'Record a battle action',
      description: 'Appends a legal battle command only when expectedSeq matches the current log. Requires mcp:write.',
      inputSchema: submitSchema.shape,
      annotations: WRITE,
    },
    ({ token, expectedSeq, command: submitted }) =>
      resultOf(async () => {
        const command = await submittedBattleCommand(owner(), submitted)
        const instance = app()
        return instance.service.submit(token, owner(), expectedSeq, command, await instance.rulesFor())
      }),
  )
}
