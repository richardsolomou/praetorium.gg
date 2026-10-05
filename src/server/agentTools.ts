import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { AgentToolDescriptor } from '../contracts/agentTools'

type ToolConfig<Shape extends z.ZodRawShape> = {
  title: string
  description: string
  inputSchema: Shape | z.ZodObject<Shape>
  outputSchema?: z.ZodRawShape
  annotations: ToolAnnotations
}

type RegisteredTool = {
  descriptor: AgentToolDescriptor
  registerMcp: (server: McpServer) => void
  parse: (input: unknown) => Promise<Record<string, unknown>>
  execute: (input: unknown) => Promise<CallToolResult>
}

export class AgentTools {
  private readonly tools = new Map<string, RegisteredTool>()

  registerTool<Shape extends z.ZodRawShape>(
    name: string,
    config: ToolConfig<Shape>,
    execute: (input: z.output<z.ZodObject<Shape>>) => Promise<CallToolResult>,
  ) {
    if (this.tools.has(name)) throw new Error(`Tool already registered: ${name}`)
    const schema = config.inputSchema instanceof z.ZodObject ? config.inputSchema : z.object(config.inputSchema)
    const parse = async (input: unknown) => {
      const parsed = await schema.safeParseAsync(input)
      if (!parsed.success) throw new Response('Tool input does not match the published schema.', { status: 400 })
      return parsed.data
    }
    this.tools.set(name, {
      descriptor: {
        name,
        title: config.title,
        description: config.description,
        inputSchema: z.toJSONSchema(schema, { io: 'input', target: 'draft-07', unrepresentable: 'any' }),
        readOnly: config.annotations.readOnlyHint === true,
        account: false,
      },
      registerMcp: (server) =>
        server.registerTool<z.ZodRawShape, z.ZodObject<Shape>>(name, { ...config, inputSchema: schema }, async (input) =>
          execute(await schema.parseAsync(input)),
        ),
      parse,
      execute: async (input) => execute(await parse(input)),
    })
  }

  descriptors(accountTools: Readonly<Record<string, unknown>>): AgentToolDescriptor[] {
    return [...this.tools.values()].map(({ descriptor }) => ({
      ...descriptor,
      account: Object.hasOwn(accountTools, descriptor.name),
    }))
  }

  registerMcp(server: McpServer) {
    for (const tool of this.tools.values()) tool.registerMcp(server)
  }

  async parseInput(name: string, input: unknown) {
    const tool = this.tools.get(name)
    if (!tool) throw new Response('Tool not found.', { status: 404 })
    return tool.parse(input)
  }

  async execute(name: string, input: unknown) {
    const tool = this.tools.get(name)
    if (!tool) throw new Response('Tool not found.', { status: 404 })
    return tool.execute(input)
  }
}
