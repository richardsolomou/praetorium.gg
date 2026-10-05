import { beforeEach, expect, it, vi } from 'vitest'

const { user, ownRoster } = vi.hoisted(() => ({ user: vi.fn(), ownRoster: vi.fn() }))
vi.mock('./playerSession', () => ({ currentUser: user }))
vi.mock('./app', () => ({ app: () => ({ service: { ownRoster } }) }))
vi.mock('./referenceApi', () => ({ activeReferenceCorpus: async () => null }))

import { browserAgentDescriptors, executeBrowserAgentTool, prepareBrowserAgentWrite } from './browserAgentTools'

beforeEach(() => {
  user.mockResolvedValue({ id: 'player-1', impersonatedBy: null })
  ownRoster.mockResolvedValue({ id: 'roster-1', name: 'My army' })
})

it('exposes all fourteen MCP tools and both resources and prompts for a signed-in player', async () => {
  const tools = await browserAgentDescriptors()
  expect(tools.map((tool) => tool.name).sort()).toEqual(
    [
      'list_my_rosters',
      'get_my_roster',
      'list_my_battles',
      'get_my_battle',
      'save_roster',
      'set_roster_visibility',
      'create_battle',
      'submit_battle_action',
      'search_reference',
      'get_reference',
      'get_reference_record',
      'list_factions',
      'list_reference',
      'list_units',
      'get_praetorium_guide',
      'get_reference_status',
      'answer_rules_question',
      'explain_mission_matchup',
    ].sort(),
  )
})

it('exposes only public tools while signed out', async () => {
  user.mockResolvedValue(null)
  expect((await browserAgentDescriptors()).filter((tool) => tool.account)).toEqual([])
})

it('does not expose account tools during impersonation', async () => {
  user.mockResolvedValue({ id: 'player-1', impersonatedBy: 'admin-1' })
  expect((await browserAgentDescriptors()).filter((tool) => tool.account)).toEqual([])
})

it('requires approval for each of the four account writes', async () => {
  const tools = await browserAgentDescriptors()
  expect(
    tools
      .filter((tool) => !tool.readOnly)
      .map((tool) => tool.name)
      .sort(),
  ).toEqual(['create_battle', 'save_roster', 'set_roster_visibility', 'submit_battle_action'])
})

it('binds account calls to the current server session', async () => {
  await executeBrowserAgentTool('get_my_roster', { id: 'roster-1' }, 'player-1')
  expect(ownRoster).toHaveBeenLastCalledWith('player-1', 'roster-1')
})

it('refuses a handler retained from another account', async () => {
  await expect(executeBrowserAgentTool('get_my_roster', { id: 'roster-1' }, 'player-2')).rejects.toMatchObject({ status: 401 })
})

it('refuses private reads after sign-out', async () => {
  user.mockResolvedValue(null)
  await expect(executeBrowserAgentTool('get_my_roster', { id: 'roster-1' }, 'player-1')).rejects.toMatchObject({ status: 401 })
})

it('refuses account calls during impersonation even when the id matches', async () => {
  user.mockResolvedValue({ id: 'player-1', impersonatedBy: 'admin-1' })
  await expect(executeBrowserAgentTool('get_my_roster', { id: 'roster-1' }, 'player-1')).rejects.toMatchObject({ status: 401 })
})

it('does not treat inherited object names as tools', async () => {
  await expect(executeBrowserAgentTool('__proto__', {}, null)).rejects.toMatchObject({ status: 404 })
})

it('validates tool input before reaching the shared service', async () => {
  ownRoster.mockClear()
  await expect(executeBrowserAgentTool('get_my_roster', { id: '' }, 'player-1')).rejects.toMatchObject({ status: 400 })
  expect(ownRoster).not.toHaveBeenCalled()
})

it('returns the same source-unavailable result through the browser adapter', async () => {
  expect(await executeBrowserAgentTool('get_reference', { id: 'missing' }, null)).toMatchObject({ isError: true })
})

it('returns shared MCP resource text through the browser adapter', async () => {
  expect(await executeBrowserAgentTool('get_reference_status', {}, null)).toEqual({
    content: [{ type: 'text', text: '{\n  "available": false\n}' }],
  })
})

it('returns the shared rules-question prompt through the browser adapter', async () => {
  const result = await executeBrowserAgentTool('answer_rules_question', { question: 'Can this unit move?', faction: 'Marines' }, null)
  expect(result.content[0]).toMatchObject({ text: expect.stringContaining('First use search_reference with faction Marines') })
})

it('preserves schema defaults in execution and publishes input JSON schemas', async () => {
  const tools = await browserAgentDescriptors()
  expect(tools.find((tool) => tool.name === 'save_roster')!.inputSchema).toMatchObject({
    type: 'object',
    properties: { visibility: { default: 'private' } },
  })
})

it('prepares a visibility change with the owned roster name', async () => {
  expect(await prepareBrowserAgentWrite('set_roster_visibility', { id: 'roster-1', visibility: 'public' }, 'player-1')).toEqual({
    input: '{"id":"roster-1","visibility":"public"}',
    summary: 'Make “My army” public.',
  })
})

it('refuses to prepare a change for a different account', async () => {
  await expect(
    prepareBrowserAgentWrite('set_roster_visibility', { id: 'roster-1', visibility: 'public' }, 'player-2'),
  ).rejects.toMatchObject({ status: 401 })
})

it('does not prepare changes to rosters the player cannot read', async () => {
  ownRoster.mockResolvedValueOnce(null)
  await expect(
    prepareBrowserAgentWrite('set_roster_visibility', { id: 'roster-1', visibility: 'public' }, 'player-1'),
  ).rejects.toMatchObject({ status: 404 })
})

it('keeps the complete battle schema refinements on the browser path', async () => {
  await expect(executeBrowserAgentTool('create_battle', { allyId: 'ally-1' }, 'player-1')).rejects.toMatchObject({ status: 400 })
})
