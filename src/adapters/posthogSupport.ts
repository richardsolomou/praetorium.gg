import { z } from 'zod'

const ticketSchema = z.object({
  distinct_id: z.string().nullish(),
  anonymous_traits: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish(),
})
const messageSchema = z.object({ author_type: z.string(), is_private: z.boolean(), created_at: z.string() })
// Results drop fields this build does not read, so PostHog adding one changes nothing here.
const messagePageSchema = z.object({ next: z.string().nullish(), results: z.array(messageSchema) })
/** Bounds the read of one conversation's messages, whose pages run oldest first. */
const MAX_MESSAGE_PAGES = 20

export type SupportTicket = z.infer<typeof ticketSchema>
export type SupportTicketMessage = z.infer<typeof messageSchema>

/** Reads one Support ticket and its messages with a key scoped to reading tickets; undefined where none is configured. */
export function posthogSupportTickets(environment: NodeJS.ProcessEnv = process.env) {
  const key = environment.POSTHOG_SUPPORT_API_KEY
  const host = environment.POSTHOG_HOST
  const project = environment.POSTHOG_PROJECT_ID
  if (!key || !host || !project) return undefined

  async function read(url: URL) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`PostHog Support answered ${response.status}`)
    return response.json() as Promise<unknown>
  }
  const ticketUrl = (path: string) => new URL(`/api/projects/${project}/conversations/tickets/${path}`, host)

  return async (ticketId: string) => {
    const id = encodeURIComponent(ticketId)
    const ticket = await read(ticketUrl(`${id}/`))
    if (!ticket) return null
    // The newest messages, which decide whether to email, come on the last page.
    const messages: SupportTicketMessage[] = []
    let next: URL | undefined = ticketUrl(`${id}/messages/`)
    for (let page = 0; next && page < MAX_MESSAGE_PAGES; page++) {
      const body = messagePageSchema.parse(await read(next))
      messages.push(...body.results)
      next = body.next ? new URL(body.next) : undefined
    }
    return { ticket: ticketSchema.parse(ticket), messages }
  }
}
