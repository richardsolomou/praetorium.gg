import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { hostVariable, postHogEnvironment, projectTokenVariable } from '../contracts/posthog'

const ticketSchema = z.object({
  distinct_id: z.string().nullish(),
  anonymous_traits: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish(),
})
const messageSchema = z.object({
  author_type: z.string(),
  author_name: z.string().nullish(),
  is_private: z.boolean(),
  created_at: z.string(),
  content: z.string().nullish(),
})
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

/** What proves to PostHog Support that a distinct id is the signed-in account, so its conversations follow the player. */
export const supportIdentityHash = (secret: string, userId: string) => createHmac('sha256', secret).update(userId).digest('hex')

const widgetConfigSchema = z.object({
  conversations: z.union([z.boolean(), z.object({ enabled: z.boolean(), token: z.string().min(1).optional() })]).nullish(),
})
const sentSchema = z.object({ ticket_id: z.string() })
const widgetTicketSchema = z.object({
  id: z.string(),
  status: z.enum(['new', 'open', 'pending', 'on_hold', 'resolved']),
  last_message: z.string().nullish(),
  last_message_at: z.string().nullish(),
  created_at: z.string(),
  message_count: z.number(),
  unread_count: z.number().nullish(),
})
const widgetTicketPageSchema = z.object({ count: z.number(), results: z.array(widgetTicketSchema) })
const widgetMessagesSchema = z.object({ messages: z.array(z.object({ content: z.string().nullish() })) })

export type SupportConversation = z.infer<typeof widgetTicketSchema>

/**
 * Starts and lists a signed-in player's Support conversations from the server, through the same widget API and identity
 * proof the browser SDK uses, so they appear beside the ones sent from the form; undefined where this instance proves no
 * identities to Support.
 */
export function posthogSupportInbox(environment: NodeJS.ProcessEnv = process.env) {
  const secret = environment.POSTHOG_SUPPORT_IDENTITY_SECRET
  const posthog = postHogEnvironment({ projectToken: environment[projectTokenVariable], host: environment[hostVariable] })
  if (!secret || !posthog) return undefined
  const { projectToken, assetsHost, host } = posthog

  // The widget token is public: every page that loads the SDK reads it from the project's remote config.
  let widgetToken: Promise<string> | undefined
  const token = () =>
    (widgetToken ??= (async () => {
      const response = await fetch(new URL(`/array/${projectToken}/config`, assetsHost), {
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`PostHog remote config answered ${response.status}`)
      const { conversations } = widgetConfigSchema.parse(await response.json())
      if (typeof conversations !== 'object' || !conversations?.enabled || !conversations.token)
        throw new Error('PostHog Support is not enabled for this project')
      return conversations.token
    })().catch((error: unknown) => {
      widgetToken = undefined
      throw error
    }))

  const identity = (userId: string) => ({ identity_distinct_id: userId, identity_hash: supportIdentityHash(secret, userId) })
  async function call(path: string, init: { method: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown }) {
    const url = new URL(`/api/conversations/v1/widget/${path}`, host)
    for (const [name, value] of Object.entries(init.query ?? {})) url.searchParams.set(name, value)
    const response = await fetch(url, {
      method: init.method,
      headers: { 'X-Conversations-Token': await token(), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(10_000),
    })
    // A token regenerated in PostHog's settings is fetched again on the next call.
    if (response.status === 401 || response.status === 403) widgetToken = undefined
    if (!response.ok) throw new Error(`PostHog Support answered ${response.status}`)
    return response.json() as Promise<unknown>
  }

  return {
    /** Opens a new conversation as the player, with the page it is about when there is one. */
    async start(userId: string, message: string, pageUrl?: string) {
      const body = {
        message,
        traits: { name: null, email: null },
        ticket_id: null,
        ...identity(userId),
        distinct_id: userId,
        ...(pageUrl ? { session_context: { current_url: pageUrl } } : {}),
      }
      return sentSchema.parse(await call('message', { method: 'POST', body })).ticket_id
    },
    /** The player's conversations, newest activity first, with each one's opening message. */
    async conversations(userId: string, page: { limit: number; offset: number }) {
      const query = { ...identity(userId), limit: String(page.limit), offset: String(page.offset) }
      const { count, results } = widgetTicketPageSchema.parse(await call('tickets', { method: 'GET', query }))
      const openings = await Promise.all(
        results.map(async (ticket) => {
          const { messages } = widgetMessagesSchema.parse(
            await call(`messages/${encodeURIComponent(ticket.id)}`, { method: 'GET', query: { ...identity(userId), limit: '1' } }),
          )
          return messages[0]?.content ?? null
        }),
      )
      return { count, conversations: results.map((ticket, at) => ({ ...ticket, opening: openings[at]! })) }
    },
  }
}

export type SupportInbox = NonNullable<ReturnType<typeof posthogSupportInbox>>
