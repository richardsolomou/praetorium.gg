import { expect, it, vi } from 'vitest'
import { AgentTools } from './agentTools'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

const { ownRoster, submit, userBattleId, screen } = vi.hoisted(() => ({
  ownRoster: vi.fn(),
  submit: vi.fn(),
  userBattleId: vi.fn(),
  screen: vi.fn(),
}))
vi.mock('./app', () => ({
  app: () => ({
    service: { ownRoster, submit, userBattleId, screen },
    rulesFor: async () => null,
    battleReadRulesFor: async () => null,
  }),
}))

import { registerAccountMcpTools } from './accountMcp'

async function call(userId: string, name: string, args: object) {
  const server = new McpServer({ name: 'account-test', version: '1.0.0' })
  const tools = new AgentTools()
  registerAccountMcpTools(tools, userId)
  tools.registerMcp(server)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(
      new Request('https://praetorium.gg/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2025-06-18',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      }),
    )
    return response.json()
  } finally {
    await server.close()
  }
}

it('reads only the signed-in player’s roster', async () => {
  ownRoster.mockResolvedValueOnce({ id: 'roster-1', name: 'My army' })
  const response = await call('player-1', 'get_my_roster', { id: 'roster-1' })
  expect(response.result.structuredContent.roster.name).toBe('My army')
  expect(ownRoster).toHaveBeenLastCalledWith('player-1', 'roster-1')
})

it('does not return a roster the player does not own', async () => {
  ownRoster.mockResolvedValueOnce(null)
  const response = await call('player-1', 'get_my_roster', { id: 'someone-elses-roster' })
  expect(response.result.isError).toBe(true)
})

it('submits a battle command with the current sequence and account identity', async () => {
  submit.mockResolvedValueOnce({ result: { outcome: 'appended' } })
  const response = await call('player-1', 'submit_battle_action', {
    token: 'battle-1',
    expectedSeq: 4,
    command: { kind: 'set-painted', painted: true },
  })
  expect(response.result.structuredContent.result.outcome).toBe('appended')
  expect(submit).toHaveBeenLastCalledWith('battle-1', 'player-1', 4, { kind: 'set-painted', painted: true }, null)
})

it('checks a battle seat before returning the private battle screen', async () => {
  userBattleId.mockRejectedValueOnce(new Response('not seated', { status: 403 }))
  const response = await call('player-1', 'get_my_battle', { token: 'private-battle' })
  expect(response.result.isError).toBe(true)
  expect(screen).not.toHaveBeenCalled()
})
