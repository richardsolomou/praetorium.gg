import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { referenceRateLimit } from '../referenceApi'
import { z } from 'zod'
import { agentInputMaxBytes } from '../../contracts/agentTools'
import { browserAgentDescriptors, executeBrowserAgentTool, prepareBrowserAgentWrite } from '../browserAgentTools'
import { mutationRpc, rpc } from '../rpc'

export const browserAgentToolCatalog = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => JSON.stringify(await browserAgentDescriptors())),
)

const agentCallSchema = z
  .object({
    name: z.string().min(1).max(128),
    input: z.string().max(agentInputMaxBytes('import_collection')),
    expectedUserId: z.string().min(1).max(64).nullable(),
  })
  .refine(({ name, input }) => new TextEncoder().encode(input).byteLength <= agentInputMaxBytes(name))

export const callBrowserAgentTool = createServerFn({ method: 'POST' })
  .validator(agentCallSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = referenceRateLimit(getRequest())
      if (limited) throw limited
      return JSON.stringify(await executeBrowserAgentTool(data.name, parseInput(data.input), data.expectedUserId))
    }),
  )

export const prepareBrowserAgentTool = createServerFn({ method: 'POST' })
  .validator(agentCallSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = referenceRateLimit(getRequest())
      if (limited) throw limited
      return prepareBrowserAgentWrite(data.name, parseInput(data.input), data.expectedUserId)
    }),
  )

function parseInput(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    throw new Response('Tool input must be valid JSON.', { status: 400 })
  }
}
