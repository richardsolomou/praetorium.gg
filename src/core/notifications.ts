import { z } from 'zod'

/**
 * Something a player who is not looking may want to act on.
 *
 * A notice carries ids rather than words, so the request that caused it never
 * waits on the lookups that name the people and the league in it. Each kind is
 * rare and asks something of its recipient; a command at a table everyone is
 * already watching is never one.
 */
export type Notice = { actorId: string; recipientIds: readonly string[] } & (
  | { kind: 'battle-created'; battleToken: string; league: boolean }
  | { kind: 'friend-requested' }
  | { kind: 'friend-accepted' }
  | { kind: 'league-entry-accepted' | 'league-revealed' | 'league-roster-unsealed'; leagueToken: string; eventToken?: string }
)

export type NoticeMessage = { title: string; body: string; path: string }

/** What a player who has never answered gets. Nothing reaches a device the player has not allowed at the system prompt. */
export const DEFAULT_PUSH_NOTIFICATIONS = true

/** Devices one account keeps; registering another forgets the one seen longest ago. */
export const PUSH_TOKENS_PER_USER = 10

export const PUSH_PLATFORMS = ['ios', 'android'] as const

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
 * Only what the recipient can already read: a name any player may see, a league
 * they entered, and a path the page behind it would show them anyway.
 */
export function noticeMessage(notice: Notice, names: { actor?: string; league?: string }): NoticeMessage | null {
  const actor = names.actor ?? 'A player'
  switch (notice.kind) {
    case 'battle-created':
      return {
        title: 'New battle',
        body: `${actor} started ${notice.league ? 'a league battle' : 'a battle'} with you.`,
        path: `/battles/${encodeURIComponent(notice.battleToken)}`,
      }
    case 'friend-requested':
      return { title: 'Friend request', body: `${actor} wants to be friends.`, path: '/friends' }
    case 'friend-accepted':
      return { title: 'New friend', body: `${actor} is now your friend.`, path: '/friends' }
    case 'league-entry-accepted':
    case 'league-revealed':
    case 'league-roster-unsealed': {
      if (!names.league) return null
      const query = notice.eventToken ? `?event=${encodeURIComponent(notice.eventToken)}` : ''
      const body = {
        'league-entry-accepted': 'The organizer accepted your entry.',
        'league-revealed': 'Rosters are revealed. League battles can start.',
        'league-roster-unsealed': 'The organizer unsealed your roster. Seal a replacement.',
      }[notice.kind]
      return { title: names.league, body, path: `/leagues/${encodeURIComponent(notice.leagueToken)}${query}` }
    }
  }
}
