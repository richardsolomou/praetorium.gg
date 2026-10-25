export const CLUB_MEMBER_STATUSES = ['pending', 'accepted'] as const
export type ClubMemberStatus = (typeof CLUB_MEMBER_STATUSES)[number]

export const CLUB_ROLES = ['member', 'admin'] as const
export type ClubRole = (typeof CLUB_ROLES)[number]

export const CLUB_NAME_MAX_LENGTH = 100
export const CLUB_DESCRIPTION_MAX_LENGTH = 2_000
export const CLUB_MEMBER_MAX = 256
export const CLUB_ADMIN_MAX = 16

/** Whether someone runs this club: its owner, or an accepted member the owner made an admin. */
export function isClubOrganizer(
  club: { ownerId: string },
  members: readonly { userId: string; status: ClubMemberStatus; role: ClubRole }[],
  userId: string | null,
) {
  if (userId === null) return false
  if (userId === club.ownerId) return true
  return members.some((member) => member.userId === userId && member.status === 'accepted' && member.role === 'admin')
}

/** Organizers see who is waiting to join; everyone else sees the accepted members and their own request. */
export function visibleClubMembers<T extends { userId: string; status: ClubMemberStatus }>(
  members: readonly T[],
  organizer: boolean,
  viewerId: string | null,
) {
  return members.filter((member) => member.status === 'accepted' || organizer || member.userId === viewerId)
}
