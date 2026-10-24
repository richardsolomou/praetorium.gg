import { z } from 'zod'

const ticketSchema = z.object({
  distinct_id: z.string().nullish(),
  anonymous_traits: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish(),
})
const messageSchema = z.object({ author_type: z.string(), is_private: z.boolean(), created_at: z.string() })
// Results drop fields this build does not read, so PostHog adding one changes nothing here.
const messagesSchema = z.union([z.array(messageSchema), z.object({ results: z.array(messageSchema) }).transform(({ results }) => results)])

export type SupportTicket = z.infer<typeof ticketSchema>
export type SupportTicketMessage = z.infer<typeof messageSchema>

/** Reads one Support ticket and its messages with a key scoped to reading tickets; undefined where none is configured. */
export function posthogSupportTickets(environment: NodeJS.ProcessEnv = process.env) {
  const key = environment.POSTHOG_SUPPORT_API_KEY
  const host = environment.POSTHOG_HOST
  const project = environment.POSTHOG_PROJECT_ID
  if (!key || !host || !project) return undefined

  async function read(path: string) {
    const response = await fetch(new URL(`/api/projects/${project}/conversations/tickets/${path}`, host), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`PostHog Support answered ${response.status}`)
    return response.json()
  }

  return async (ticketId: string) => {
    const id = encodeURIComponent(ticketId)
    const ticket = await read(`${id}/`)
    if (!ticket) return null
    return { ticket: ticketSchema.parse(ticket), messages: messagesSchema.parse(await read(`${id}/messages/`)) }
  }
}
