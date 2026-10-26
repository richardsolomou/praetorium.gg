import { posthog, type GetMessagesResponse, type GetTicketsOptions, type Message, type TicketStatus } from 'posthog-js'
import { feedbackTicketMessage } from './feedback'

type Ticket = { id: string; status: TicketStatus; unread: number; messages: Message[] }

const STORAGE_KEY = 'praetorium-dev-support'
const REPLY_MS = 8_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

const REPLIES = [
  'Thanks, I can reproduce this. Looking into it now.',
  'Good idea! I have added it to the list.',
  'Could you tell me which device and browser you were using?',
]

function seed(): Ticket[] {
  const at = (ago: number) => new Date(Date.now() - ago).toISOString()
  const message = (author: 'player' | 'team', content: string, ago: number): Message => ({
    id: crypto.randomUUID(),
    content,
    author_type: author === 'player' ? 'customer' : 'human',
    author_name: author === 'player' ? undefined : 'Richard',
    created_at: at(ago),
    is_private: false,
  })
  return [
    {
      id: crypto.randomUUID(),
      status: 'pending',
      unread: 2,
      messages: [
        message(
          'player',
          feedbackTicketMessage({
            kind: 'Problem',
            message: 'The unit picker will not scroll on my iPad once the list has more than 20 units.',
            screenshotUrl: `${window.location.origin}/api/feedback-screenshots/00000000-0000-4000-8000-000000000000`,
          }),
          2 * DAY,
        ),
        message(
          'team',
          'Thanks for the report! Which iPadOS version are you on, and does it happen in Safari or the app?',
          2 * DAY - 3 * HOUR,
        ),
        message('player', 'iPadOS 26.1, in Safari.', DAY + 2 * HOUR),
        message('player', 'It also happens in the app.', DAY + 2 * HOUR - 60_000),
        { ...message('team', 'Internal note: same root cause as the detachment panel bug.', 45 * 60_000), is_private: true },
        message('team', 'Found it: the picker was trapping touch scrolling inside the detachment panel.', 40 * 60_000),
        message('team', 'A fix is going out in the next release. Let me know if it still happens after that.', 38 * 60_000),
      ],
    },
    {
      id: crypto.randomUUID(),
      status: 'new',
      unread: 0,
      messages: [
        message(
          'player',
          feedbackTicketMessage({ kind: 'Idea', message: 'Could the simulator remember the last two units I compared?' }),
          5 * HOUR,
        ),
      ],
    },
    {
      id: crypto.randomUUID(),
      status: 'open',
      unread: 0,
      messages: [
        message(
          'player',
          feedbackTicketMessage({ kind: 'Other', message: 'Is there a way to export a tournament’s results to a spreadsheet?' }),
          3 * DAY,
        ),
        message('team', 'Not yet, but I’m looking at it.', 2 * DAY),
      ],
    },
    {
      id: crypto.randomUUID(),
      status: 'resolved',
      unread: 0,
      messages: [
        message(
          'player',
          feedbackTicketMessage({ kind: 'Problem', message: 'The leaderboard shows my old name after I renamed my account.' }),
          9 * DAY,
        ),
        message('team', 'Fixed now: the leaderboard refreshes names within a minute. Thanks!', 8 * DAY),
      ],
    },
  ]
}

/**
 * Stands in for PostHog Support on a local dev server, which never loads the browser SDK: a few conversations to
 * read, kept in this browser across reloads, and a team reply shortly after each message so polling can be watched.
 */
export function installDevSupport() {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  const tickets: Ticket[] = stored ? (JSON.parse(stored) as Ticket[]) : seed()
  let current: string | null = tickets[0]?.id ?? null
  const save = () => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
  save()
  const find = (id: string | null | undefined) => {
    const ticket = tickets.find((candidate) => candidate.id === id)
    if (!ticket) throw new Error('That conversation does not exist.')
    return ticket
  }
  const visible = (ticket: Ticket) => ticket.messages.filter((message) => !message.is_private)
  const lastActive = (ticket: Ticket) => Date.parse(ticket.messages.at(-1)!.created_at)
  const replyLater = (ticket: Ticket) =>
    window.setTimeout(() => {
      ticket.messages.push({
        id: crypto.randomUUID(),
        content: REPLIES[Math.floor(Math.random() * REPLIES.length)]!,
        author_type: 'human',
        author_name: 'Richard',
        created_at: new Date().toISOString(),
        is_private: false,
      })
      ticket.status = 'pending'
      ticket.unread++
      save()
    }, REPLY_MS)

  ;(posthog as unknown as { conversations: unknown }).conversations = {
    isAvailable: () => true,
    getCurrentTicketId: () => current,
    sendMessage: async (content: string, _traits?: unknown, newTicket?: boolean) => {
      if (newTicket || !current) {
        current = crypto.randomUUID()
        tickets.unshift({ id: current, status: 'new', unread: 0, messages: [] })
      }
      const ticket = find(current)
      const created_at = new Date().toISOString()
      ticket.messages.push({ id: crypto.randomUUID(), content, author_type: 'customer', created_at, is_private: false })
      if (ticket.status !== 'new') ticket.status = 'open'
      save()
      replyLater(ticket)
      return { ticket_id: ticket.id, message_id: ticket.messages.at(-1)!.id, ticket_status: ticket.status, created_at, unread_count: 0 }
    },
    getTickets: async ({ limit = 20, offset = 0 }: GetTicketsOptions = {}) => {
      const ordered = [...tickets].sort((a, b) => lastActive(b) - lastActive(a))
      return {
        count: ordered.length,
        results: ordered.slice(offset, offset + limit).map((ticket) => {
          const shown = visible(ticket)
          return {
            id: ticket.id,
            status: ticket.status,
            last_message: shown.at(-1)?.content,
            last_message_at: shown.at(-1)?.created_at,
            created_at: ticket.messages[0]!.created_at,
            message_count: shown.length,
            unread_count: ticket.unread,
          }
        }),
      }
    },
    getMessages: async (id?: string): Promise<GetMessagesResponse> => {
      const ticket = find(id ?? current)
      current = ticket.id
      return { ticket_id: ticket.id, ticket_status: ticket.status, messages: ticket.messages, has_more: false, unread_count: ticket.unread }
    },
    markAsRead: async (id?: string) => {
      find(id ?? current).unread = 0
      save()
      return { success: true, unread_count: 0 }
    },
  }
}
