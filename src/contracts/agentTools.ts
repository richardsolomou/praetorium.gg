export const AGENT_INPUT_MAX_BYTES = 64 * 1024

export type AgentToolDescriptor = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
  account: boolean
}

export const TOOL_ERROR_TYPES = ['validation', 'not_found', 'refused', 'unauthorized', 'unavailable', 'internal'] as const
export type ToolErrorType = (typeof TOOL_ERROR_TYPES)[number]
/** Where a failed result names its bounded failure category, so analytics can count failures without reading their text. */
export const TOOL_ERROR_TYPE_META = 'gg.praetorium/errorType'
