import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { EmailMessage } from '../adapters/email'
import type { SupportTicket, SupportTicketMessage } from '../adapters/posthogSupport'
import { ticketSubject } from '../contracts/feedback'

/** What a PostHog Workflow posts for each public reply we send on a Support ticket. */
const replySchema = z.object({ ticket_id: z.string().min(1).max(100) })

type Recipient = { name: string; email: string }

export type SupportReplyDeps = {
  /** Unset where this instance does not tell players about replies, which answers as if the route did not exist. */
  secret: string | undefined
  readTicket: (ticketId: string) => Promise<{ ticket: SupportTicket; messages: SupportTicketMessage[] } | null>
  account: (id: string) => Promise<Recipient | null | undefined>
  send: (email: EmailMessage) => Promise<unknown>
  appUrl: string
}

const sameSecret = (given: string, expected: string) =>
  timingSafeEqual(createHash('sha256').update(given).digest(), createHash('sha256').update(expected).digest())

/**
 * Whether this reply is the first we sent since the player last wrote, so a run of replies is one email and their next
 * message starts another.
 */
export function firstReplySincePlayer(messages: readonly SupportTicketMessage[]) {
  const ordered = [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const lastFromPlayer = ordered.findLastIndex((message) => message.author_type === 'customer')
  return ordered.slice(lastFromPlayer + 1).filter((message) => message.author_type !== 'customer' && !message.is_private).length === 1
}

/** The player an email reaches: their account when the conversation is theirs, or the address a guest left. */
async function recipientFor(ticket: SupportTicket, account: SupportReplyDeps['account']): Promise<Recipient | null> {
  const owner = ticket.distinct_id ? await account(ticket.distinct_id) : null
  if (owner) return owner
  const email = z.email().safeParse(ticket.anonymous_traits?.email)
  return email.success ? { name: ticket.anonymous_traits?.name ?? '', email: email.data } : null
}

type ReplyEmail = {
  name: string
  url: string
  /** The first line of what the player wrote, so they know which conversation this is. */
  subject?: string
  /** The first name the reply is signed with. */
  replier?: string
}

/** Shows the player's own words and who replied, never the reply itself, so the conversation stays in the app. */
export function supportReplyEmail({ name, url, subject, replier }: ReplyEmail) {
  return {
    template: 'supportReply' as const,
    // Liquid treats an empty string as true, so a missing value is left out rather than sent empty.
    data: { url, ...(name ? { name } : {}), ...(subject ? { subject } : {}), ...(replier ? { replier } : {}) },
  }
}

/** The conversation's subject and who signed the reply that prompted this email. */
function aboutReply(messages: readonly SupportTicketMessage[]) {
  const opening = messages.find((message) => message.author_type === 'customer')?.content
  const reply = messages.findLast((message) => message.author_type !== 'customer' && !message.is_private)
  return {
    subject: opening ? ticketSubject(opening) || undefined : undefined,
    replier: reply?.author_name?.trim().split(/\s+/)[0] || undefined,
    replyAt: reply?.created_at,
  }
}

/** Emails the player when we reply to their message, at most once per run of replies. */
export async function supportReplyResponse(request: Request, deps: SupportReplyDeps) {
  if (!deps.secret) return new Response(null, { status: 404 })
  if (!sameSecret(request.headers.get('x-praetorium-webhook-secret') ?? '', deps.secret)) return new Response(null, { status: 401 })
  const reply = replySchema.safeParse(await request.json().catch(() => null))
  if (!reply.success) return new Response('expected a ticket_id', { status: 400 })
  const found = await deps.readTicket(reply.data.ticket_id)
  if (!found) return new Response('no such ticket', { status: 404 })
  if (!firstReplySincePlayer(found.messages)) return new Response(null, { status: 204 })
  const recipient = await recipientFor(found.ticket, deps.account)
  if (!recipient) return new Response(null, { status: 204 })
  const url = new URL('/support', deps.appUrl)
  url.searchParams.set('conversation', reply.data.ticket_id)
  const ordered = [...found.messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const { replyAt, ...about } = aboutReply(ordered)
  await deps.send({
    to: recipient.email,
    ...(found.ticket.distinct_id ? { distinctId: found.ticket.distinct_id } : {}),
    ...supportReplyEmail({ name: recipient.name, url: url.href, ...about }),
    // A redelivered webhook for the same reply then sends nothing more.
    idempotencyKey: `supportReply:${reply.data.ticket_id}:${replyAt}`,
  })
  return new Response(null, { status: 204 })
}
