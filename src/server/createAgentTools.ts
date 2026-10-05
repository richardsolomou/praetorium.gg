import { AgentTools } from './agentTools'
import { registerAccountMcpTools } from './accountMcp'
import { registerReferenceTools } from './referenceTools'

export function createAgentTools(userId: string | null) {
  const tools = new AgentTools()
  registerAccountMcpTools(tools, userId)
  registerReferenceTools(tools)
  return tools
}
