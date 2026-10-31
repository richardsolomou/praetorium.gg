import { z } from 'zod'

export const hiddenListGameTimeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((timeZone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(0)
      return true
    } catch {
      return false
    }
  }, 'choose a valid timezone')

/** The first instant after this calendar day, including days shortened or lengthened by daylight saving. */
function dayEndsAt(at: number, timeZone: string) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' })
  const day = date.format(at)
  let before = at
  let after = at + 48 * 60 * 60_000
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2)
    if (date.format(middle) === day) before = middle
    else after = middle
  }
  return after
}

export function hiddenListGamePastAt(game: {
  playsAt: number | null
  revealedAt: number | null
  supersededAt: number | null
  timeZone: string
}) {
  const day = game.playsAt ?? game.revealedAt
  const endsAt = day === null ? null : dayEndsAt(day, game.timeZone)
  return game.supersededAt === null ? endsAt : endsAt === null ? game.supersededAt : Math.min(endsAt, game.supersededAt)
}

export function hiddenListGameOpen(game: { pastAt: number | null }, now: number) {
  return game.pastAt === null || now < game.pastAt
}

export const GROUP_MEMBER_STATUSES = ['pending', 'accepted'] as const
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number]

export const GROUP_ROLES = ['member', 'admin'] as const
export type GroupRole = (typeof GROUP_ROLES)[number]

/** The seats a group's team game offers: one solo player against an allied pair, or two pairs. */
export const HIDDEN_LIST_GAME_SIDES = ['solo', 'pair', 'team-1', 'team-2'] as const

export const GROUP_NAME_MAX_LENGTH = 100
export const GROUP_DESCRIPTION_MAX_LENGTH = 2_000
export const GROUP_MEMBER_MAX = 256
export const GROUP_ADMIN_MAX = 16

/** Whether someone runs this group: its owner, or an accepted member the owner made an admin. */
export function isGroupOrganizer(
  group: { ownerId: string },
  members: readonly { userId: string; status: GroupMemberStatus; role: GroupRole }[],
  userId: string | null,
) {
  if (userId === null) return false
  if (userId === group.ownerId) return true
  return members.some((member) => member.userId === userId && member.status === 'accepted' && member.role === 'admin')
}

/** Organizers see who is waiting to join; everyone else sees the accepted members and their own request. */
export function visibleGroupMembers<T extends { userId: string; status: GroupMemberStatus }>(
  members: readonly T[],
  organizer: boolean,
  viewerId: string | null,
) {
  return members.filter((member) => member.status === 'accepted' || organizer || member.userId === viewerId)
}
