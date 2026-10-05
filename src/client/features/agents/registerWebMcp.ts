import { AGENT_INPUT_MAX_BYTES, type AgentToolDescriptor } from '../../../contracts/agentTools'

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
export type WebMcpTool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; consequentialHint: boolean; untrustedContentHint: boolean }
  execute: (input: unknown, options?: { signal: AbortSignal }) => Promise<ToolResult>
}
export type ModelContext = {
  registerTool: (tool: WebMcpTool, options: { signal: AbortSignal }) => Promise<void> | void
}

type Handlers = {
  signal: AbortSignal
  invoke: (tool: AgentToolDescriptor, input: string, signal: AbortSignal) => Promise<ToolResult>
  prepare: (tool: AgentToolDescriptor, input: string, signal: AbortSignal) => Promise<{ input: string; summary: string }>
  approve: (tool: AgentToolDescriptor, input: Record<string, unknown>, summary: string, signal: AbortSignal) => Promise<boolean>
  finishWrite: (error: string | null) => void
}

export function browserModelContext(): ModelContext | undefined {
  return (document as Document & { modelContext?: ModelContext }).modelContext
}

const failure = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

export async function installWebMcp(context: ModelContext, descriptors: AgentToolDescriptor[], handlers: Handlers) {
  let writing = false
  for (const tool of descriptors) {
    if (handlers.signal.aborted) return
    await context.registerTool(
      {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: tool.readOnly, consequentialHint: !tool.readOnly, untrustedContentHint: true },
        execute: async (input, options) => {
          const signal = options?.signal ? AbortSignal.any([handlers.signal, options.signal]) : handlers.signal
          if (signal.aborted) return failure('Request cancelled.')
          if (!tool.readOnly && writing) return failure('Another change is awaiting approval or being saved. Ask again after it finishes.')
          if (!tool.readOnly) writing = true
          let error: string | null = null
          try {
            let serialized = JSON.stringify(input)
            if (!serialized || new TextEncoder().encode(serialized).byteLength > AGENT_INPUT_MAX_BYTES) {
              return failure('The proposed input is too large.')
            }
            let summary = ''
            if (!tool.readOnly) {
              const prepared = await handlers.prepare(tool, serialized, signal)
              serialized = prepared.input
              summary = prepared.summary
            }
            const proposal: unknown = JSON.parse(serialized)
            if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return failure('Tool input must be an object.')
            if (!tool.readOnly && !(await handlers.approve(tool, proposal as Record<string, unknown>, summary, signal))) {
              return failure('The player declined the change or the approval expired. Nothing was submitted.')
            }
            if (signal.aborted) return failure('Request cancelled. Nothing was submitted.')
            const result = await handlers.invoke(tool, serialized, signal)
            if (result.isError) error = result.content.map((item) => item.text).join('\n')
            return result
          } catch (caught) {
            error = caught instanceof Error ? caught.message : 'The request failed.'
            return failure(error)
          } finally {
            if (!tool.readOnly) {
              writing = false
              handlers.finishWrite(error)
            }
          }
        },
      },
      { signal: handlers.signal },
    )
  }
}
