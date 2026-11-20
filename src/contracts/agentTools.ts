export const AGENT_INPUT_MAX_BYTES = 64 * 1024
// All 5,000 collection rows may carry 32 alternative catalogue IDs each.
const COLLECTION_IMPORT_MAX_BYTES = 12 * 1024 * 1024

export function agentInputMaxBytes(name: string) {
  return name === 'import_collection' ? COLLECTION_IMPORT_MAX_BYTES : AGENT_INPUT_MAX_BYTES
}

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
/** Where a result names bounded facts about what it found, such as how many results, so analytics can count empty answers. */
export const TOOL_OUTCOME_META = 'gg.praetorium/outcome'
export type ToolOutcome = Record<string, number | boolean>
