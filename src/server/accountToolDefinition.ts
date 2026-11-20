import type { z } from 'zod'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { READ_ONLY_TOOL, signedInPlayer, type AgentTools } from './agentTools'
import { resultOf } from './accountToolResult'
import type { McpAccountScope } from '../shared/mcpConsent'

type Approval = (owner: string, input: Record<string, unknown>) => string | Promise<string>

function accountTool<Shape extends z.ZodRawShape>(
  scope: McpAccountScope,
  title: string,
  description: string,
  inputSchema: z.ZodObject<Shape>,
  run: (owner: string, input: z.output<z.ZodObject<Shape>>) => Promise<Record<string, unknown> | void | null>,
  annotations: ToolAnnotations,
  approval?: Approval,
) {
  return {
    scope,
    approval:
      approval ??
      ((_owner, input) => {
        const details = Object.entries(input)
          .map(([field, value]) => `${field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}: ${JSON.stringify(value)}`)
          .join(', ')
        return details ? `${title}. ${details}.` : `${title}.`
      }),
    register(server: AgentTools, name: string, userId: string | null) {
      server.registerTool(name, { title, description: `${description} Requires ${scope}.`, inputSchema, annotations }, (input) =>
        resultOf(async () => (await run(signedInPlayer(userId), input)) ?? { ok: true }),
      )
    },
  }
}

export function read<Shape extends z.ZodRawShape>(
  title: string,
  description: string,
  schema: z.ZodObject<Shape>,
  run: (owner: string, input: z.output<z.ZodObject<Shape>>) => Promise<Record<string, unknown>>,
) {
  return accountTool('mcp:read', title, description, schema, run, READ_ONLY_TOOL)
}

export function write<Shape extends z.ZodRawShape>(
  title: string,
  description: string,
  schema: z.ZodObject<Shape>,
  run: (owner: string, input: z.output<z.ZodObject<Shape>>) => Promise<Record<string, unknown> | void | null>,
  effects: { destructive: boolean; public: boolean },
  approval?: Approval,
) {
  return accountTool(
    'mcp:manage',
    title,
    description,
    schema,
    run,
    {
      readOnlyHint: false,
      destructiveHint: effects.destructive,
      openWorldHint: effects.public,
    },
    approval,
  )
}
