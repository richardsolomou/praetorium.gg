import { expect, it, vi } from 'vitest'
import { WriteApproval } from './WriteApproval'
import type { AgentToolDescriptor } from '../../../contracts/agentTools'

const tool: AgentToolDescriptor = {
  name: 'save_roster',
  title: 'Save roster',
  description: '',
  inputSchema: {},
  readOnly: false,
  account: true,
}

it('keeps a write pending until the player approves', async () => {
  const approval = new WriteApproval(() => {})
  const result = approval.request(tool, { name: 'My army' }, 'Save this roster.', new AbortController().signal)
  approval.approve()
  expect(await result).toBe(true)
})

it('clears a declined proposal without authorizing it', async () => {
  const approval = new WriteApproval(() => {})
  const result = approval.request(tool, {}, 'Save this roster.', new AbortController().signal)
  approval.dismiss()
  expect(await result).toBe(false)
})

it('cancels a proposal when its caller aborts', async () => {
  const approval = new WriteApproval(() => {})
  const caller = new AbortController()
  const result = approval.request(tool, {}, 'Save this roster.', caller.signal)
  caller.abort()
  expect(await result).toBe(false)
})

it('expires an unanswered proposal after two minutes', async () => {
  vi.useFakeTimers()
  try {
    const approval = new WriteApproval(() => {})
    const result = approval.request(tool, {}, 'Save this roster.', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await result).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

it('cannot approve a completed proposal again', async () => {
  const changed = vi.fn()
  const approval = new WriteApproval(changed)
  const result = approval.request(tool, {}, 'Save this roster.', new AbortController().signal)
  approval.approve()
  await result
  approval.finish(null)
  changed.mockClear()
  approval.approve()
  expect(changed).not.toHaveBeenCalled()
})
