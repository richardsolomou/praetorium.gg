import { z } from 'zod'

const SEALED_EVENT_KINDS = [
  'sealed-event-entry-requested',
  'sealed-event-entry-accepted',
  'sealed-event-entry-added',
  'sealed-event-entry-rejected',
  'sealed-event-roster-reseal',
  'sealed-event-revealed',
  'sealed-event-roster-unsealed',
  'sealed-event-roster-reminder',
  'sealed-event-battlefield-set',
  'sealed-event-battlefield-cleared',
] as const

const token = z.string().min(1).max(128)

/** What a notice is about, as it is stored for its recipient. */
export const noticeSubjectSchema = z.union([
  z.object({
    kind: z.literal('battle-created'),
    battleToken: token,
    sealedEvent: z.boolean(),
    /** The link an invited friend joins through, while their place is open. */
    invite: token.optional(),
  }),
  z.object({ kind: z.enum(['friend-requested', 'friend-accepted']) }),
  z.object({ kind: z.enum(SEALED_EVENT_KINDS), sealedEventToken: token, eventToken: token.optional() }),
  z.object({
    kind: z.literal('sealed-event-round-paired'),
    sealedEventToken: token,
    eventToken: token.optional(),
    round: z.number().int().positive(),
  }),
  z.object({ kind: z.enum(['group-member-requested', 'group-member-accepted']), groupToken: token }),
  z.object({ kind: z.literal('group-league-deadline-reminder'), groupToken: token, round: z.number().int().positive() }),
])

export type NoticeSubject = z.infer<typeof noticeSubjectSchema>

/**
 * Something a player who is not looking may want to act on.
 *
 * A notice carries ids rather than words, so the request that caused it never
 * waits on the lookups that name the people and the sealed event in it. Each kind is
 * rare and asks something of its recipient; a command at a table everyone is
 * already watching is never one.
 */
export type Notice = { actorId: string; recipientIds: readonly string[] } & NoticeSubject

/** A notice as its recipient keeps it. */
export type StoredNotice = { actorId: string } & NoticeSubject

type NoticeMessage = { title: string; body: string; path: string }

export const pushTokenSchema = z
  .string()
  .max(256)
  .regex(/^Expo(?:nent)?PushToken\[[^[\]\s]+\]$/)

/**
 * The browser push services a subscription may name. The server posts to the endpoint
 * a page hands it, so anything else would let a player point that post at any host.
 */
const PUSH_SERVICE_HOST =
  /^(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/

function isPushServiceUrl(endpoint: string) {
  if (!URL.canParse(endpoint)) return false
  const url = new URL(endpoint)
  return url.protocol === 'https:' && !url.port && !url.username && !url.password && PUSH_SERVICE_HOST.test(url.hostname)
}

/** A browser's push subscription, with its keys as unpadded base64url. */
export const webPushSubscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isPushServiceUrl, 'Not a browser push service'),
  // A P-256 public key is 65 bytes and the authentication secret 16.
  p256dh: z.string().regex(/^[\w-]{87}$/),
  auth: z.string().regex(/^[\w-]{22}$/),
})
export type WebPushSubscription = z.infer<typeof webPushSubscriptionSchema>

/** Who a notice is for: never the player who caused it. */
export function noticeRecipients(notice: Notice): string[] {
  return [...new Set(notice.recipientIds)].filter((id) => id !== notice.actorId)
}

/**
 * The words and destination of a notice, or null when its subject has gone.
 *
 * Only what the recipient can already read: a name any player may see, a sealed event
 * or group they entered, and a path the page behind it would show them anyway.
 */
export function noticeMessage(notice: StoredNotice, names: { actor?: string; sealedEvent?: string; group?: string }): NoticeMessage | null {
  const actor = names.actor ?? 'A player'
  switch (notice.kind) {
    case 'battle-created':
      if (notice.invite) return { title: 'Battle invite', body: `${actor} invited you to a battle.`, path: battleInvitePath(notice.invite) }
      return {
        title: 'New battle',
        body: `${actor} started ${notice.sealedEvent ? 'a sealed-roster battle' : 'a battle'} with you.`,
        path: `/battles/${encodeURIComponent(notice.battleToken)}`,
      }
    case 'friend-requested':
      return { title: 'Friend request', body: `${actor} wants to be friends.`, path: '/friends' }
    case 'friend-accepted':
      return { title: 'New friend', body: `${actor} is now your friend.`, path: '/friends' }
    case 'sealed-event-entry-requested':
    case 'sealed-event-entry-accepted':
    case 'sealed-event-entry-added':
    case 'sealed-event-entry-rejected':
    case 'sealed-event-roster-reseal':
    case 'sealed-event-revealed':
    case 'sealed-event-roster-unsealed':
    case 'sealed-event-roster-reminder':
    case 'sealed-event-battlefield-set':
    case 'sealed-event-battlefield-cleared': {
      if (!names.sealedEvent) return null
      const body = {
        'sealed-event-entry-requested': `${actor} requested to join. Review their entry.`,
        'sealed-event-entry-accepted': 'The organizer accepted your entry.',
        'sealed-event-entry-added': `${actor} added you as a player. Seal your list.`,
        'sealed-event-entry-rejected': 'The organizer declined your entry.',
        'sealed-event-roster-reseal': 'Your sealed list was cleared after a size or team change. Seal a replacement.',
        'sealed-event-revealed': 'The rosters are out. Start your battles.',
        'sealed-event-roster-unsealed': 'The organizer unsealed your roster. Seal a replacement.',
        // The recipient's timezone is unknown here, so the deadline stays on the page they open.
        'sealed-event-roster-reminder': 'Seal your list before the deadline.',
        'sealed-event-battlefield-set': 'The organizer set your battlefield. Take a look before the game.',
        'sealed-event-battlefield-cleared': 'The organizer cleared your battlefield, so you’ll choose it at the table.',
      }[notice.kind]
      return { title: names.sealedEvent, body, path: sealedEventPath(notice) }
    }
    case 'sealed-event-round-paired':
      if (!names.sealedEvent) return null
      return { title: names.sealedEvent, body: `Round ${notice.round} is paired. See your table.`, path: sealedEventPath(notice) }
    case 'group-member-requested':
    case 'group-member-accepted':
      if (!names.group) return null
      return {
        title: names.group,
        body:
          notice.kind === 'group-member-requested' ? `${actor} asked to join. Let them in from the group page.` : 'You’re in the group.',
        path: `/groups/${encodeURIComponent(notice.groupToken)}`,
      }
    case 'group-league-deadline-reminder':
      if (!names.group) return null
      return {
        title: names.group,
        // As with the seal reminder, the deadline itself stays on the page, in the recipient's own timezone.
        body: `Round ${notice.round} of the league ends soon. Finish your game before the deadline.`,
        path: `/groups/${encodeURIComponent(notice.groupToken)}?tab=league`,
      }
  }
}

/** Where a battle's link joins it. */
export function battleInvitePath(invite: string) {
  return `/battles/join/${encodeURIComponent(invite)}`
}

function sealedEventPath(notice: { sealedEventToken: string; eventToken?: string }) {
  const query = notice.eventToken ? `?event=${encodeURIComponent(notice.eventToken)}` : ''
  return `/tournaments/${encodeURIComponent(notice.sealedEventToken)}${query}`
}
