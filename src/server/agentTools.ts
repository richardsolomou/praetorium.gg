import { z } from 'zod'
import { withTextPointers, withoutTexts, type TextLocations } from '../shared/sourceText'
import { publishedTextLocations } from './publishedTextFiles'
import { absoluteAgentLinks, absoluteAgentText } from './agentLinks'
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
  registerMcp: (server: McpServer, origin: string) => void
  parse: (input: unknown) => Promise<Record<string, unknown>>
  execute: (input: unknown) => Promise<CallToolResult>
}

/**
 * A tool's answer as agents get it: facts and pointers to where withheld rules text lives
 * upstream, never the words. JSON text mirrors the structured answer, so it gets the same
 * pointers; any other text only loses its tokens.
 */
async function published(result: CallToolResult): Promise<CallToolResult> {
  const locations = await publishedTextLocations()
  return {
    ...result,
    content: result.content.map((item) =>
      item.type === 'text' ? { ...item, text: publishedText(item.text, locations) } : withoutTexts(item),
    ),
    ...(result.structuredContent ? { structuredContent: withTextPointers(result.structuredContent, locations) } : {}),
  }
}

function publishedText(text: string, locations: TextLocations) {
  try {
    const parsed: unknown = JSON.parse(text)
    return JSON.stringify(withTextPointers(parsed, locations), null, text.startsWith('{\n  ') || text.startsWith('[\n  ') ? 2 : undefined)
  } catch {
    return withoutTexts(text)
  }
}

export const READ_ONLY_TOOL: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

/** An answer whose JSON text mirrors its structured content, for clients that read only the text. */
export function structured<T extends Record<string, unknown>>(result: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }
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
      registerMcp: (server, origin) =>
        server.registerTool<z.ZodRawShape, z.ZodObject<Shape>>(
          name,
          // Directory scanners read the listing name from annotations.title, not the tool's own title.
          { ...config, annotations: { title: config.title, ...config.annotations }, inputSchema: schema },
          async (input) => {
            const result = await published(await execute(await schema.parseAsync(input)))
            return {
              ...result,
              content: result.content.map((item) =>
                item.type === 'text' ? { ...item, text: absoluteAgentText(item.text, origin) } : item,
              ),
              ...(result.structuredContent ? { structuredContent: absoluteAgentLinks(result.structuredContent, origin) } : {}),
            }
          },
        ),
      parse,
      execute: async (input) => published(await execute(await parse(input))),
    })
  }

  descriptors(accountTools: Readonly<Record<string, unknown>>): AgentToolDescriptor[] {
    return [...this.tools.values()].map(({ descriptor }) => ({
      ...descriptor,
      account: Object.hasOwn(accountTools, descriptor.name),
    }))
  }

  registerMcp(server: McpServer, origin: string) {
    for (const tool of this.tools.values()) tool.registerMcp(server, origin)
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
