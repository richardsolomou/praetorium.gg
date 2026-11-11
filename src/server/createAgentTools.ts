import { AgentTools } from './agentTools'
import { registerAccountMcpTools } from './accountMcp'
import { registerBattleTools } from './battleTools'
import { registerSkillTools } from './agentSkills'
import { registerChangeTools } from './changeTools'
import { registerCombatTools } from './combatTools'
import { registerOrganisedPlayTools } from './organisedPlayTools'
import { registerReferenceTools } from './referenceTools'
import { registerRosterComparisonTools } from './rosterComparison'
import { registerRosterTools } from './rosterTools'
import { registerRosterAccountTools } from './rosterAccountTools'
import { registerRosterFileTools } from './rosterFileTools'

export function createAgentTools(userId: string | null) {
  const tools = new AgentTools()
  registerAccountMcpTools(tools, userId)
  registerBattleTools(tools, userId)
  registerReferenceTools(tools)
  registerCombatTools(tools)
  registerChangeTools(tools)
  registerRosterTools(tools)
  registerRosterComparisonTools(tools)
  registerRosterFileTools(tools)
  registerRosterAccountTools(tools, userId)
  registerOrganisedPlayTools(tools, userId)
  registerSkillTools(tools)
  return tools
}
