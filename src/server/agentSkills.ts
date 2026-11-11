import { z } from 'zod'
import { READ_ONLY_TOOL, type AgentTools } from './agentTools'

const files = import.meta.glob<string>('../../plugin/skills/*/SKILL.md', { query: '?raw', import: 'default', eager: true })

/** The plugin's skills, which the MCP server also serves so a client without the plugin gets the same guidance. */
export const agentSkills = Object.entries(files).map(([path, raw]) => {
  const file = raw.replaceAll('\r\n', '\n')
  const parts = /^---\n([\s\S]*?)\n---\n+# (.+)\n([\s\S]*)$/.exec(file)
  const field = (key: string) => parts?.[1]?.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1]?.trim()
  const name = field('name')
  const description = field('description')
  if (!parts || !name || !description) throw new Error(`${path} needs name and description frontmatter and a # heading.`)
  return { name, description, title: parts[2]!, body: `# ${parts[2]}\n${parts[3]}` }
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
