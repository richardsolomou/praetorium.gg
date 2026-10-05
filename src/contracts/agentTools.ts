export const AGENT_INPUT_MAX_BYTES = 64 * 1024

export type AgentToolDescriptor = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
  account: boolean
}
