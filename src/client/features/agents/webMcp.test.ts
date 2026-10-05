import { expect, it, vi } from 'vitest'
import type { AgentToolDescriptor } from '../../../contracts/agentTools'
import { installWebMcp, type ModelContext, type WebMcpTool } from './registerWebMcp'

const read: AgentToolDescriptor = {
  name: 'get_my_roster',
  title: 'Read my roster',
  description: 'Read',
  inputSchema: {},
  readOnly: true,
  account: true,
}
const write: AgentToolDescriptor = { ...read, name: 'save_roster', title: 'Save my roster', readOnly: false }

async function harness(descriptors = [read, write]) {
  const tools = new Map<string, WebMcpTool>()
  const context: ModelContext = {
    registerTool: async (tool, { signal }) => {
      tools.set(tool.name, tool)
      signal.addEventListener('abort', () => tools.delete(tool.name), { once: true })
    },
  }
  const lifetime = new AbortController()
  const invoke = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'Saved' }] }))
  const prepare = vi.fn(async (_tool: AgentToolDescriptor, input: string) => ({ input, summary: 'Save this roster.' }))
  const approve = vi.fn(async () => true)
  const finishWrite = vi.fn()
  await installWebMcp(context, descriptors, { signal: lifetime.signal, invoke, prepare, approve, finishWrite })
  const call = (name: string, input: unknown = {}, signal = new AbortController().signal) => tools.get(name)!.execute(input, { signal })
  return { tools, invoke, approve, finishWrite, lifetime, call }
}

it('registers every supplied tool and removes them when the account changes', async () => {
  const h = await harness()
  h.lifetime.abort()
  expect(h.tools.size).toBe(0)
})

it('calls reads without asking for write approval', async () => {
  const h = await harness()
  await h.call(read.name, { id: 'roster-1' })
  expect(h.approve).not.toHaveBeenCalled()
})

it('does not invoke a write before approval arrives', async () => {
  const h = await harness()
  let approve!: (allowed: boolean) => void
  h.approve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        approve = resolve
      }),
  )
  const result = h.call(write.name)
  await vi.waitFor(() => expect(h.approve).toHaveBeenCalled())
  expect(h.invoke).not.toHaveBeenCalled()
  approve(false)
  await result
})

it('does not invoke a declined write', async () => {
  const h = await harness()
  h.approve.mockResolvedValueOnce(false)
  await h.call(write.name)
  expect(h.invoke).not.toHaveBeenCalled()
})

it('uses the exact input shown for approval even if the caller changes its object', async () => {
  const h = await harness()
  const input = { name: 'My army' }
  h.approve.mockImplementationOnce(async () => {
    input.name = 'Changed'
    return true
  })
  await h.call(write.name, input)
  expect(h.invoke).toHaveBeenCalledWith(write, '{"name":"My army"}', expect.any(AbortSignal))
})

it('refuses an overlapping write rather than queueing unseen changes', async () => {
  const h = await harness()
  let approve!: (allowed: boolean) => void
  h.approve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        approve = resolve
      }),
  )
  const first = h.call(write.name)
  await vi.waitFor(() => expect(h.approve).toHaveBeenCalled())
  const second = await h.call(write.name)
  approve(false)
  await first
  expect(second).toMatchObject({ isError: true })
})

it('does not dispatch an approved write after cancellation', async () => {
  const h = await harness()
  const abort = new AbortController()
  h.approve.mockImplementationOnce(async () => {
    abort.abort()
    return true
  })
  await h.call(write.name, {}, abort.signal)
  expect(h.invoke).not.toHaveBeenCalled()
})

it('does not dispatch an old handler after sign-out', async () => {
  const h = await harness()
  const tool = h.tools.get(read.name)!
  h.lifetime.abort()
  await tool.execute({}, { signal: new AbortController().signal })
  expect(h.invoke).not.toHaveBeenCalled()
})

it('rejects oversized input before presenting an approval', async () => {
  const h = await harness()
  await h.call(write.name, { name: '界'.repeat(25_000) })
  expect(h.approve).not.toHaveBeenCalled()
})

it('returns a failed write without retrying it', async () => {
  const h = await harness()
  h.invoke.mockRejectedValueOnce(new Error('Connection lost; check the saved roster before trying again.'))
  await h.call(write.name)
  expect(h.invoke).toHaveBeenCalledTimes(1)
})

it('executes tools on browsers that do not provide a per-call cancellation signal', async () => {
  const h = await harness()
  await h.tools.get(read.name)!.execute({ id: 'roster-1' })
  expect(h.invoke).toHaveBeenCalledWith(read, '{"id":"roster-1"}', h.lifetime.signal)
})
