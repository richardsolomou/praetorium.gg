import { z } from 'zod'

/**
 * Something a player who is not looking may want to act on.
 *
 * A notice carries ids rather than words, so the request that caused it never
 * waits on the lookups that name the people and the sealed event in it. Each kind is
 * rare and asks something of its recipient; a command at a table everyone is
 * already watching is never one.
 */
export type Notice = { actorId: string; recipientIds: readonly string[] } & (
  | { kind: 'battle-created'; battleToken: string; sealedEvent: boolean }
  | { kind: 'friend-requested' }
  | { kind: 'friend-accepted' }
  | {
      kind:
        | 'sealed-event-entry-requested'
        | 'sealed-event-entry-accepted'
        | 'sealed-event-entry-added'
        | 'sealed-event-entry-rejected'
        | 'sealed-event-roster-reseal'
        | 'sealed-event-revealed'
        | 'sealed-event-roster-unsealed'
        | 'sealed-event-roster-reminder'
      sealedEventToken: string
      eventToken?: string
    }
  | { kind: 'sealed-event-round-paired'; sealedEventToken: string; eventToken?: string; round: number }
  | { kind: 'group-member-requested' | 'group-member-accepted'; groupToken: string }
)

type NoticeMessage = { title: string; body: string; path: string }

export const pushTokenSchema = z
  .string()
  .max(256)
  .regex(/^Expo(?:nent)?PushToken\[[^[\]\s]+\]$/)

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
export function noticeMessage(notice: Notice, names: { actor?: string; sealedEvent?: string; group?: string }): NoticeMessage | null {
  const actor = names.actor ?? 'A player'
  switch (notice.kind) {
    case 'battle-created':
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
    case 'sealed-event-roster-reminder': {
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
  }
}

function sealedEventPath(notice: { sealedEventToken: string; eventToken?: string }) {
  const query = notice.eventToken ? `?event=${encodeURIComponent(notice.eventToken)}` : ''
  return `/tournaments/${encodeURIComponent(notice.sealedEventToken)}${query}`
}
