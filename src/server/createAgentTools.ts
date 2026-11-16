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
import { registerWinningListTools } from './winningListTools'

export function createAgentTools(userId: string | null) {
  const tools = new AgentTools()
  tools.section('account', () => registerAccountMcpTools(tools, userId))
  tools.section('battles', () => registerBattleTools(tools, userId))
  tools.section('reference', () => registerReferenceTools(tools))
  tools.section('combat', () => registerCombatTools(tools))
  tools.section('reference', () => registerChangeTools(tools))
  tools.section('rosters', () => {
    registerRosterTools(tools)
    registerRosterComparisonTools(tools)
    registerRosterFileTools(tools)
    registerWinningListTools(tools)
    registerRosterAccountTools(tools, userId)
  })
  tools.section('events', () => registerOrganisedPlayTools(tools, userId))
  tools.section('skills', () => registerSkillTools(tools))
  return tools
}
