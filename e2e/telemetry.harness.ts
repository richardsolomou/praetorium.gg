import type { Page } from '@playwright/test'

export type Event = { name: string; properties: Record<string, unknown> }

/** Records the browser client's captures on this page from now on, without sending them. */
export async function recordEvents(page: Page) {
  const events: Event[] = []
  await page.exposeFunction('recordTelemetry', (name: string, properties: Record<string, unknown> = {}) =>
    events.push({ name, properties }),
  )
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((entry) => /\/assets\/telemetry-[^/]+\.js/.test(entry.name))?.name
    if (!url) throw new Error('The production telemetry chunk did not load')
    const exports = await import(url)
    const client = Object.values(exports).find(
      (value) =>
        value !== null &&
        typeof value === 'object' &&
        'capture' in value &&
        typeof value.capture === 'function' &&
        'identify' in value &&
        typeof value.identify === 'function',
    ) as
      | {
          capture: (name: string, properties?: Record<string, unknown>) => unknown
          captureException: (error: unknown, properties?: Record<string, unknown>) => void
        }
      | undefined
    if (!client) throw new Error('The telemetry chunk did not export the browser client')
    const record = (name: string, properties?: Record<string, unknown>) =>
      void (
        window as unknown as { recordTelemetry: (name: string, properties?: Record<string, unknown>) => Promise<void> }
      ).recordTelemetry(name, properties)
    // A queued event is what the SDK returns, so callers that check it see a sent event.
    client.capture = (name, properties) => (record(name, properties), { event: name, properties })
    // The SDK drops exceptions until it is configured, which browser test stacks never do.
    client.captureException = (error, properties) =>
      record('$exception', { message: error instanceof Error ? error.message : String(error), ...properties })
  })
  return events
}

type SupportMessage = {
  id: string
  content: string
  author_type: 'customer' | 'human'
  author_name?: string
  created_at: string
  is_private: boolean
}
type SupportTicket = { id: string; status: string; messages: SupportMessage[]; unread: number }

/**
 * Stands in for PostHog Support on this page, which browser test stacks cannot reach: tickets live in the page,
 * and the returned helpers read what the player sent and answer as the team. `earlier` conversations exist before
 * the page can first read them, as `seed` cannot promise once Support answers.
 */
export async function stubSupport(page: Page, earlier = 0) {
  await page.evaluate(async (initial) => {
    const url = performance.getEntriesByType('resource').find((entry) => /\/assets\/telemetry-[^/]+\.js/.test(entry.name))?.name
    if (!url) throw new Error('The production telemetry chunk did not load')
    const exports = await import(url)
    const client = Object.values(exports).find(
      (value) => value !== null && typeof value === 'object' && 'conversations' in value && 'identify' in value,
    ) as { conversations: unknown; setIdentity: () => void; clearIdentity: () => void } | undefined
    if (!client) throw new Error('The telemetry chunk did not export the browser client')
    const tickets: SupportTicket[] = []
    let current: string | null = null
    const now = () => new Date().toISOString()
    const summary = (ticket: SupportTicket) => ({
      id: ticket.id,
      status: ticket.status,
      last_message: ticket.messages.at(-1)!.content,
      last_message_at: ticket.messages.at(-1)!.created_at,
      created_at: ticket.messages[0].created_at,
      message_count: ticket.messages.length,
      unread_count: ticket.unread,
    })
    const find = (id: string | null) => {
      const ticket = tickets.find((candidate) => candidate.id === id)
      if (!ticket) throw new Error('Unknown ticket')
      return ticket
    }
    ;(window as unknown as { support: unknown }).support = {
      tickets,
      reply: (id: string, content: string) => {
        const ticket = find(id)
        ticket.messages.push({
          id: crypto.randomUUID(),
          content: 'Internal note',
          author_type: 'human',
          created_at: now(),
          is_private: true,
        })
        ticket.messages.push({
          id: crypto.randomUUID(),
          content,
          author_type: 'human',
          author_name: 'Richard',
          created_at: now(),
          is_private: false,
        })
        ticket.status = 'pending'
        ticket.unread++
      },
      seed: (count: number) => {
        for (let index = count; index > 0; index--) {
          const id = crypto.randomUUID()
          tickets.push({
            id,
            status: 'new',
            unread: 0,
            messages: [
              { id: crypto.randomUUID(), content: `Feedback ${index}`, author_type: 'customer', created_at: now(), is_private: false },
            ],
          })
          current = id
        }
      },
    }
    client.setIdentity = () => {}
    client.clearIdentity = () => {}
    client.conversations = {
      isAvailable: () => true,
      getCurrentTicketId: () => current,
      sendMessage: async (content: string, _traits: unknown, newTicket?: boolean) => {
        if (newTicket || !current) {
          current = crypto.randomUUID()
          tickets.unshift({ id: current, status: 'new', messages: [], unread: 0 })
        }
        const ticket = find(current)
        ticket.messages.push({ id: crypto.randomUUID(), content, author_type: 'customer', created_at: now(), is_private: false })
        if (ticket.status !== 'new') ticket.status = 'open'
        return {
          ticket_id: ticket.id,
          message_id: ticket.messages.at(-1)!.id,
          ticket_status: ticket.status,
          created_at: now(),
          unread_count: 0,
        }
      },
      getTickets: async ({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}) => ({
        count: tickets.length,
        results: tickets.slice(offset, offset + limit).map(summary),
      }),
      getMessages: async (id: string) => {
        current = id
        const ticket = find(id)
        return { ticket_id: id, ticket_status: ticket.status, messages: ticket.messages, has_more: false, unread_count: ticket.unread }
      },
      markAsRead: async (id: string) => {
        find(id).unread = 0
        return { success: true, unread_count: 0 }
      },
    }
    ;(window as unknown as { support: { seed: (count: number) => void } }).support.seed(initial)
  }, earlier)
  return {
    tickets: () => page.evaluate(() => (window as unknown as { support: { tickets: SupportTicket[] } }).support.tickets),
    /** Adds conversations the player started earlier, newest first as "Feedback <count>" down to "Feedback 1". */
    seed: (count: number) =>
      page.evaluate((total) => (window as unknown as { support: { seed: (count: number) => void } }).support.seed(total), count),
    reply: (id: string, content: string) =>
      page.evaluate(
        ([ticketId, text]) =>
          (window as unknown as { support: { reply: (ticketId: string, text: string) => void } }).support.reply(ticketId, text),
        [id, content] as const,
      ),
  }
}
