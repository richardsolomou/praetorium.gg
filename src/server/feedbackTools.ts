import { z } from 'zod'
import { posthogSupportInbox, type SupportInbox } from '../adapters/posthogSupport'
import { FEEDBACK_KINDS, FEEDBACK_MESSAGE_MAX_LENGTH, feedbackTicketMessage, messagePreview, ticketSubject } from '../contracts/feedback'
import { read, write } from './accountToolDefinition'
import { captureMutation } from './mutationTelemetry'
import { configuredOrigin } from './origins'
import { fixedWindowLimit } from './rateLimit'
import { snapshotRevision } from './snapshotMemo'

const FEEDBACK_PAGE = 10
const STATUS = { new: 'sent', open: 'open', pending: 'replied', on_hold: 'on hold', resolved: 'resolved' } as const

// An assistant retrying in a loop must not flood the team's inbox; a player reporting several gaps at once still can.
const sendLimit = fixedWindowLimit('too many feedback messages', 3)

const id = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^[^\r\n]+$/, 'expected one line')
const sendFeedbackInput = z.object({
  kind: z.enum(FEEDBACK_KINDS).describe('Problem for something wrong, Idea for a request, Other for anything else.'),
  message: z
    .string()
    .trim()
    .min(1)
    .max(FEEDBACK_MESSAGE_MAX_LENGTH)
    .describe(
      'What the player wants the team to know, in their words or as they agreed: what happened, what they expected, and how to see it. The first line names the conversation.',
    ),
  about: z
    .object({
      notCalculated: z.array(id).max(20).optional().describe('Rule ids from a simulate_combat notCalculated list.'),
      simulatorUrl: z
        .string()
        .max(6000)
        .regex(/^\/simulator\?[^\s]*$/, 'expected the simulatorUrl a combat tool returned')
        .optional()
        .describe('The simulatorUrl a combat tool returned, as given.'),
      faction: id.optional().describe('A faction slug or catalogue id.'),
      detachment: id.optional().describe('A detachment id or name.'),
      units: z.array(id).max(10).optional().describe('Unit ids, as list_units gives them.'),
    })
    .optional()
    .describe('Ids the tools returned for what the feedback is about, so the team can reproduce it.'),
})

const listFeedbackInput = z.object({
  offset: z.number().int().min(0).max(10_000).default(0).describe('How many conversations to skip, for the next page.'),
})

const PREVIEW_LENGTH = 500
const preview = (content: string) => {
  const text = messagePreview(content)
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text
}

// Kept for the process, so the widget token is read from PostHog once.
let reached: SupportInbox | undefined

/** Support as this instance reaches it, or the refusal that sends the player to the form. */
function inbox() {
  const support = (reached ??= posthogSupportInbox())
  if (!support)
    throw new Response('Support is not reachable from this Praetorium server. Ask the player to send it from the Support page: /support.', {
      status: 409,
    })
  return support
}

/** A path as a link the team can open from the Support inbox. */
const appLink = (path: string) => {
  const origin = configuredOrigin()
  return origin ? new URL(path, origin).href : path
}

/** The ids an assistant attached, as lines the team and the player can both read in the conversation. */
function aboutLines(about: z.output<typeof sendFeedbackInput>['about']) {
  const lines = [
    about?.notCalculated?.length ? `Not calculated: ${about.notCalculated.join(', ')}` : null,
    about?.faction ? `Faction: ${about.faction}` : null,
    about?.detachment ? `Detachment: ${about.detachment}` : null,
    about?.units?.length ? `Units: ${about.units.join(', ')}` : null,
    about?.simulatorUrl ? `Simulator: ${appLink(about.simulatorUrl)}` : null,
    `Data: ${snapshotRevision() ?? 'unavailable'}`,
  ]
  return lines.filter((line): line is string => line !== null)
}

export const feedbackAccountTools = {
  send_feedback: write(
    'Send feedback to the Praetorium team',
    'Starts a new Support conversation as the signed-in player, the same as sending the Support page form, and returns its link. The team replies there, and the player sees the conversation and its replies on the Support page. Use it for a problem, an idea or a gap the player wants reported, such as a rule simulate_combat lists under notCalculated. Show the player the message and get their agreement before sending, and check list_my_feedback first so the same report is not sent twice. Pass the ids the tools returned in about rather than describing rules in your own words; the current data revision is added.',
    sendFeedbackInput,
    async (owner, { kind, message, about }) => {
      if (sendLimit(owner))
        throw new Response('Too many feedback messages in the last minute. Wait a minute before sending more.', { status: 429 })
      const body = [message, '', ...aboutLines(about)].join('\n')
      const ticketId = await inbox().start(
        owner,
        feedbackTicketMessage({ kind, message: body, assistant: true }),
        about?.simulatorUrl ? appLink(about.simulatorUrl) : undefined,
      )
      captureMutation(owner, 'feedback_sent', {
        kind,
        about_rules: about?.notCalculated?.length ?? 0,
        simulator: Boolean(about?.simulatorUrl),
      })
      return { conversationId: ticketId, url: `/support?conversation=${encodeURIComponent(ticketId)}` }
    },
    { destructive: false, public: true, scope: 'mcp:write' },
    (_owner, input) => {
      const { kind, message } = sendFeedbackInput.parse(input)
      return `Send ${kind.toLowerCase()} feedback to the Praetorium team as you: “${ticketSubject(message)}”.`
    },
  ),
  list_my_feedback: read(
    'List my feedback conversations',
    `Lists the signed-in player's Support conversations, newest activity first, ${FEEDBACK_PAGE} a page: each one's subject (the first line the player wrote), opening message, status (sent, open, replied, on hold or resolved), latest message once someone has replied, message count and unread replies, with its link. Read it before send_feedback to find a report already sent. count is the total; pass offset for the next page.`,
    listFeedbackInput,
    async (owner, { offset }) => {
      const { count, conversations } = await inbox().conversations(owner, { limit: FEEDBACK_PAGE, offset })
      return {
        count,
        conversations: conversations.map((ticket) => ({
          id: ticket.id,
          url: `/support?conversation=${encodeURIComponent(ticket.id)}`,
          subject: ticket.opening ? ticketSubject(ticket.opening) : null,
          opening: ticket.opening ? preview(ticket.opening) : null,
          status: STATUS[ticket.status],
          latest: ticket.message_count > 1 && ticket.last_message ? preview(ticket.last_message) : null,
          latestAt: ticket.last_message_at ?? null,
          createdAt: ticket.created_at,
          messages: ticket.message_count,
          unread: ticket.unread_count ?? 0,
        })),
      }
    },
  ),
}
