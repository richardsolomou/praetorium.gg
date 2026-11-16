import { z } from 'zod'
import { withTextPointers, withoutTexts, type TextLocations } from '../core/sourceText'
import { publishedTextLocations } from './publishedTextFiles'
import { absoluteAgentLinks, absoluteAgentText } from './agentLinks'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import {
  TOOL_ERROR_TYPE_META,
  TOOL_OUTCOME_META,
  type AgentToolDescriptor,
  type ToolErrorType,
  type ToolOutcome,
} from '../contracts/agentTools'

type ToolConfig<Shape extends z.ZodRawShape> = {
  title: string
  description: string
  inputSchema: Shape | z.ZodObject<Shape>
  outputSchema?: z.ZodRawShape
  annotations: ToolAnnotations
}

type RegisteredTool = {
  descriptor: AgentToolDescriptor
  registerMcp: (server: McpServer, origin: string, auth: McpAuth) => void
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

/** A thrown Response is a refusal the HTTP routes answer with a status; MCP answers it as a tool error instead. */
async function mcpResult(execute: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await execute()
  } catch (error) {
    if (error instanceof Response) return responseToolError(error)
    throw error
  }
}

/**
 * Which tools need an account, and the challenge an unauthorized one carries. A client links the account from the
 * declared scheme and the challenge on the tool result, so the session keeps its public tools; a transport 401 would
 * make some clients drop the whole server.
 */
export type McpAuth = { scopes: Readonly<Record<string, string>>; challenge: string }

/** The signed-in player an account tool acts for; without one it refuses with the sign-in the tool needs. */
export function signedInPlayer(userId: string | null) {
  if (!userId)
    throw new Response(
      "Sign in to Praetorium to use this tool: connect the player's account in their assistant, such as /mcp or claude mcp login in Claude Code. Praetorium's public tools keep working without it.",
      { status: 401 },
    )
  return userId
}

export const READ_ONLY_TOOL: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

export function toolError(type: ToolErrorType, text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
    isError: true as const,
    _meta: { [TOOL_ERROR_TYPE_META]: type },
  }
}

/** A refused HTTP-style answer as a tool error; server faults keep their detail out of the result. */
export async function responseToolError(response: Response) {
  const { status } = response
  if (status >= 500) return toolError(status === 503 ? 'unavailable' : 'internal', 'Praetorium could not complete this request.')
  const type: ToolErrorType =
    status === 401 || status === 403
      ? 'unauthorized'
      : status === 404
        ? 'not_found'
        : status === 400 || status === 422
          ? 'validation'
          : 'refused'
  return toolError(type, await response.text())
}

/** An answer whose JSON text mirrors its structured content, for clients that read only the text. */
export function structured<T extends Record<string, unknown>>(result: T, outcome?: ToolOutcome) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result,
    ...(outcome ? { _meta: { [TOOL_OUTCOME_META]: outcome } } : {}),
  }
}

export class AgentTools {
  private readonly tools = new Map<string, RegisteredTool>()
  private category: string | undefined

  /** Registers a group of tools under one category, which analytics breaks usage down by. */
  section(category: string, register: () => void) {
    this.category = category
    try {
      register()
    } finally {
      this.category = undefined
    }
  }

  registerTool<Shape extends z.ZodRawShape>(
    name: string,
    config: ToolConfig<Shape>,
    execute: (input: z.output<z.ZodObject<Shape>>) => Promise<CallToolResult>,
  ) {
    if (this.tools.has(name)) throw new Error(`Tool already registered: ${name}`)
    const schema = config.inputSchema instanceof z.ZodObject ? config.inputSchema : z.object(config.inputSchema)
    const category = this.category
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
      registerMcp: (server, origin, auth) =>
        server.registerTool<z.ZodRawShape, z.ZodObject<Shape>>(
          name,
          // Directory scanners read the listing name from annotations.title, not the tool's own title.
          {
            ...config,
            annotations: { title: config.title, ...config.annotations },
            inputSchema: schema,
            _meta: {
              ...(category ? { category } : {}),
              securitySchemes: auth.scopes[name] ? [{ type: 'oauth2', scopes: [auth.scopes[name]] }] : [{ type: 'noauth' }],
            },
          },
          async (input) => {
            const result = await published(await mcpResult(async () => execute(input)))
            const unauthorized = result.isError && result._meta?.[TOOL_ERROR_TYPE_META] === 'unauthorized'
            return {
              ...result,
              ...(unauthorized ? { _meta: { ...result._meta, 'mcp/www_authenticate': [auth.challenge] } } : {}),
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

  /** Every registered name, so analytics can tell a real tool from a probe for one that does not exist. */
  names(): ReadonlySet<string> {
    return new Set(this.tools.keys())
  }

  registerMcp(server: McpServer, origin: string, auth: McpAuth) {
    for (const tool of this.tools.values()) tool.registerMcp(server, origin, auth)
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
