import { expect, it, vi } from 'vitest'

const { changeLogPage } = vi.hoisted(() => ({ changeLogPage: vi.fn() }))
vi.mock('./catalogueChangePages', () => ({ changeLogPage }))
vi.mock('./publishedTextFiles', () => ({
  publishedTextLocations: async () => ({ files: {}, holds: () => false, recordsHolding: () => [] }),
}))

import { AgentTools } from './agentTools'
import { registerChangeTools } from './changeTools'

it('links an older update to the page of the index that lists it', async () => {
  changeLogPage.mockResolvedValueOnce({
    updates: [{ anchor: 'update-2026-11-01-abcdef12', recordedAt: 0, total: 0, open: true, omitted: 0, groups: [] }],
    older: null,
  })
  const tools = new AgentTools()
  registerChangeTools(tools)
  const result = await tools.execute('list_data_updates', { faction: 'necrons', before: 'cursor' })
  expect((result.structuredContent as { updates: { url: string }[] }).updates[0]!.url).toBe(
    '/data-updates/necrons?before=cursor#update-2026-11-01-abcdef12',
  )
})
