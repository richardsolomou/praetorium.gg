import { z } from 'zod'
import type { AgentTools } from './agentTools'
import { activeReferenceCorpus } from './referenceApi'
import { praetoriumGuideMarkdown } from './referenceGuide'
import { referenceIndex } from './referenceService'

export const referenceResources = [
  {
    name: 'praetorium-guide',
    toolName: 'get_praetorium_guide',
    uri: 'praetorium://guide',
    title: 'How Praetorium works',
    description: 'Product capabilities, privacy boundaries, data trust model, and efficient agent workflow.',
    mimeType: 'text/markdown',
    read: async () => praetoriumGuideMarkdown(),
  },
  {
    name: 'reference-status',
    toolName: 'get_reference_status',
    uri: 'praetorium://reference-status',
    title: 'Praetorium reference status',
    description: 'Active snapshot revisions and the available public reference catalogue.',
    mimeType: 'application/json',
    read: async () => {
      const corpus = await activeReferenceCorpus()
      return JSON.stringify(corpus ? { available: true, ...referenceIndex(corpus) } : { available: false }, null, 2)
    },
  },
]

export const rulesQuestionPrompt = {
  name: 'answer_rules_question',
  title: 'Answer a game-rules question',
  description: 'Search the verified reference and answer with source URLs without guessing.',
  argsSchema: {
    question: z.string().trim().min(2).max(500),
    faction: z.string().trim().min(1).max(160).optional(),
  },
}
export function rulesQuestionText({ question, faction }: z.infer<z.ZodObject<typeof rulesQuestionPrompt.argsSchema>>) {
  return `Answer this question from Praetorium's verified reference: ${question}\n\nFirst use search_reference${faction ? ` with faction ${faction}` : ''}, then read the relevant result. Cite its canonical URL and say explicitly if the source does not answer the question.`
}

export const missionMatchupPrompt = {
  name: 'explain_mission_matchup',
  title: 'Explain a mission matchup',
  description: 'Resolve a force-disposition pairing and explain its mission, scoring, deployment, and terrain.',
  argsSchema: {
    pack: z.string().trim().min(1).max(160),
    yourDisposition: z.string().trim().min(1).max(160),
    opponentDisposition: z.string().trim().min(1).max(160),
  },
}
export function missionMatchupText({
  pack,
  yourDisposition,
  opponentDisposition,
}: z.infer<z.ZodObject<typeof missionMatchupPrompt.argsSchema>>) {
  return `Use list_reference and search_reference with pack ${pack} to resolve ${yourDisposition} vs ${opponentDisposition}. Read the structured mission, deployment, and terrain records before explaining the primary scoring and setup. Cite canonical URLs and do not infer missing card text.`
}

export function promptMessages(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

export function registerReferenceContextTools(tools: AgentTools) {
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  for (const resource of referenceResources) {
    tools.registerTool(resource.toolName, { ...resource, inputSchema: {}, annotations }, async () => ({
      content: [{ type: 'text', text: await resource.read() }],
    }))
  }
  tools.registerTool(
    rulesQuestionPrompt.name,
    { ...rulesQuestionPrompt, inputSchema: rulesQuestionPrompt.argsSchema, annotations },
    async (input) => ({ content: [{ type: 'text', text: rulesQuestionText(input) }] }),
  )
  tools.registerTool(
    missionMatchupPrompt.name,
    { ...missionMatchupPrompt, inputSchema: missionMatchupPrompt.argsSchema, annotations },
    async (input) => ({ content: [{ type: 'text', text: missionMatchupText(input) }] }),
  )
}
