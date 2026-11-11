import { z } from 'zod'
import { READ_ONLY_TOOL, type AgentTools } from './agentTools'

const files = import.meta.glob<string>('../../plugin/skills/*/SKILL.md', { query: '?raw', import: 'default', eager: true })

/** The plugin's skills, which the MCP server also serves so a client without the plugin gets the same guidance. */
export const agentSkills = Object.values(files).map((file) => {
  const match = /^---\nname: (.+)\ndescription: (.+)\n---\n+# (.+)\n([\s\S]*)$/.exec(file)
  if (!match) throw new Error('A plugin skill needs name and description frontmatter and a heading.')
  return { name: match[1]!, description: match[2]!, title: match[3]!, body: `# ${match[3]}\n${match[4]}` }
})

const skillNames = agentSkills.map((skill) => skill.name) as [string, ...string[]]

export function registerSkillTools(tools: AgentTools) {
  tools.registerTool(
    'get_skill',
    {
      title: 'Read a Praetorium skill',
      description: `Returns step-by-step guidance for a task, including the Warhammer 40,000 knowledge and tool order it needs. Read the matching skill before starting the task. Skills: ${agentSkills.map((skill) => `${skill.name}: ${skill.description}`).join(' ')}`,
      inputSchema: { name: z.enum(skillNames).describe('The skill to read.') },
      annotations: READ_ONLY_TOOL,
    },
    async ({ name }) => ({ content: [{ type: 'text', text: agentSkills.find((skill) => skill.name === name)!.body }] }),
  )
}
