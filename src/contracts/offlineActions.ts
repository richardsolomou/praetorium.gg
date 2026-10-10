import { z } from 'zod'
import * as schemas from './schemas'

export const offlineActionSchemas = {
  setOwned: schemas.ownedSchema,
  setFavouriteFaction: schemas.favouriteFactionSchema,
  setFavouriteDetachment: schemas.favouriteDetachmentSchema,
  setPlayerDefaults: schemas.playerDefaultsSchema,
  setBattleAudience: schemas.battleAudienceSchema,
  setPushNotifications: schemas.pushPreferenceSchema,
  updateOnboardingProgress: schemas.onboardingUpdateSchema,
  requestFriend: schemas.friendSchema,
  acceptFriend: schemas.friendSchema,
  rejectFriend: schemas.friendSchema,
  removeFriend: schemas.friendSchema,
  acceptFriendInvite: schemas.friendInviteSchema,
  createFriendInvite: z.object({}),
  cancelFriendInvite: z.object({}),
  createLeague: schemas.createLeagueSchema,
  createLeagueEvent: schemas.createLeagueEventSchema,
  joinLeague: schemas.leagueEventSchema,
  addLeagueEntrants: schemas.addLeagueEntrantsSchema,
  admitLeagueEntries: schemas.admitLeagueEntriesSchema,
  moderateLeagueEntry: schemas.moderateLeagueEntrySchema,
  submitLeagueRoster: schemas.submitLeagueRosterSchema.extend({
    capturedRoster: schemas.saveRosterSchema,
    catalogueRevision: z.string().min(1).max(128),
  }),
  revealLeague: schemas.leagueEventSchema,
  unsealLeagueRoster: schemas.leagueRosterSchema,
  assignLeagueRosterRequirement: schemas.assignLeagueRosterRequirementSchema,
  assignLeagueTeam: schemas.assignLeagueTeamSchema,
  updateLeague: schemas.updateLeagueSchema,
  deleteLeague: schemas.tokenSchema,
  deleteBattle: schemas.deleteBattleSchema,
  createBattle: schemas.createBattleSchema,
  createLeagueBattle: schemas.createLeagueBattleSchema,
} as const
export type OfflineActionKind = keyof typeof offlineActionSchemas
export const offlineActionKind = z.enum(Object.keys(offlineActionSchemas) as [OfflineActionKind, ...OfflineActionKind[]])
export const offlineActionSchema = z.object({
  owner: z.string().min(1).max(128),
  operationId: z.uuid(),
  kind: offlineActionKind,
  input: z.unknown(),
  createdAt: z.number().int().nonnegative(),
  identifiers: z
    .record(z.string().min(1).max(32), z.uuid())
    .refine((value) => Object.keys(value).length <= 8)
    .default({}),
})
