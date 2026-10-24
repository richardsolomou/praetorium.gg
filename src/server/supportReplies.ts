import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { SupportTicket, SupportTicketMessage } from '../adapters/posthogSupport'

/** What a PostHog Workflow posts for each public reply we send on a Support ticket. */
const replySchema = z.object({ ticket_id: z.string().min(1).max(100) })

type Recipient = { name: string; email: string }

export type SupportReplyDeps = {
  /** Unset where this instance does not tell players about replies, which answers as if the route did not exist. */
  secret: string | undefined
  readTicket: (ticketId: string) => Promise<{ ticket: SupportTicket; messages: SupportTicketMessage[] } | null>
  account: (id: string) => Promise<Recipient | null | undefined>
  send: (email: { to: string; subject: string; text: string; html: string }) => Promise<unknown>
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

const escape = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)

/** Praetorium's slate and chalk, inlined because mail clients ignore stylesheets. */
const EMAIL = {
  void: '#0e1316',
  panel: '#141a1e',
  edge: '#28323a',
  bone: '#e7ece9',
  dim: '#a6b0ae',
  faint: '#86918f',
  green: '#9bd0a9',
  greenInk: '#0c2014',
  font: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

/** Says only that we replied, so the conversation and anything private in it stay in the app. */
export function supportReplyEmail({ name, url }: { name: string; url: string }) {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const lead = 'We replied to your message on Praetorium. Read our reply and answer it here:'
  const footer = 'You are getting this because you contacted us through Praetorium.'
  const text = [greeting, '', lead, url, '', footer].join('\n')
  const origin = new URL(url).origin
  const link = escape(url)
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>We replied to your message</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL.void};">
<div style="display:none;max-height:0;overflow:hidden;">Read our reply and answer it in Praetorium.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL.void};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${EMAIL.panel};border:1px solid ${EMAIL.edge};font-family:${EMAIL.font};">
<tr><td style="padding:20px 28px;border-bottom:1px solid ${EMAIL.edge};">
<a href="${escape(origin)}" style="text-decoration:none;color:${EMAIL.bone};">
<img src="${escape(origin)}/email-logo.png" width="28" height="28" alt="" style="vertical-align:middle;border:0;">
<span style="vertical-align:middle;margin-left:10px;font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${EMAIL.bone};">Praetorium</span>
</a>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${EMAIL.bone};">We replied to your message</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${EMAIL.bone};">${escape(greeting)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${EMAIL.dim};">We replied to your message on Praetorium. Read our reply and answer it in the app.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${EMAIL.green};border-radius:4px;">
<a href="${link}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:${EMAIL.greenInk};text-decoration:none;">Read our reply</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${EMAIL.faint};">Or open this link:<br><a href="${link}" style="color:${EMAIL.green};word-break:break-all;">${link}</a></p>
</td></tr>
<tr><td style="padding:24px 28px;">
<p style="margin:0;padding-top:16px;border-top:1px solid ${EMAIL.edge};font-size:12px;line-height:1.5;color:${EMAIL.faint};">${escape(footer)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { subject: 'We replied to your message', text, html }
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
  await deps.send({ to: recipient.email, ...supportReplyEmail({ name: recipient.name, url: url.href }) })
  return new Response(null, { status: 204 })
}
