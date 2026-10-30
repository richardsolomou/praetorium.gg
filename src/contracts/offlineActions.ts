import { z } from 'zod'
import * as schemas from './schemas'

export const offlineActionSchemas = {
  setOwned: schemas.ownedSchema,
  setCollectionModels: schemas.collectionModelsSchema,
  setCollectionProgress: schemas.collectionProgressSchema,
  setCollectionCountsAs: schemas.collectionCountsAsSchema,
  setCollectionWanted: schemas.collectionWantedSchema,
  setFavouriteFaction: schemas.favouriteFactionSchema,
  setFavouriteDetachment: schemas.favouriteDetachmentSchema,
  setFavouriteDatasheet: schemas.favouriteDatasheetSchema,
  rememberMatchup: schemas.rememberMatchupSchema,
  forgetMatchup: schemas.forgetMatchupSchema,
  setAbilityReminder: schemas.setAbilityReminderSchema,
  removeAbilityReminder: schemas.removeAbilityReminderSchema,
  setPlayerDefaults: schemas.playerDefaultsSchema,
  setPushNotifications: schemas.pushPreferenceSchema,
  updateOnboardingProgress: schemas.onboardingUpdateSchema,
  requestFriend: schemas.friendSchema,
  acceptFriend: schemas.friendSchema,
  rejectFriend: schemas.friendSchema,
  removeFriend: schemas.friendSchema,
  acceptFriendInvite: schemas.friendInviteSchema,
  createFriendInvite: z.object({}),
  cancelFriendInvite: z.object({}),
  createLeague: schemas.createSealedEventSchema,
  joinLeague: schemas.sealedEventSchema,
  addLeagueEntrants: schemas.addSealedEventEntrantsSchema,
  admitLeagueEntries: schemas.admitSealedEventEntriesSchema,
  moderateLeagueEntry: schemas.moderateSealedEventEntrySchema,
  submitLeagueRoster: schemas.submitSealedEventRosterSchema.extend({
    capturedRoster: schemas.saveRosterSchema,
    catalogueRevision: z.string().min(1).max(128),
  }),
  setLeagueTeamDisposition: schemas.setSealedEventTeamDispositionSchema,
  setLeagueTeamWarlord: schemas.setSealedEventTeamWarlordSchema,
  revealLeague: schemas.sealedEventSchema,
  unsealLeagueRoster: schemas.sealedEventRosterSchema,
  assignLeagueRosterRequirement: schemas.assignSealedEventRosterRequirementSchema,
  assignLeagueTeam: schemas.assignSealedEventTeamSchema,
  chooseLeagueSide: schemas.chooseSealedEventSideSchema,
  updateLeague: schemas.updateSealedEventSchema,
  deleteLeague: schemas.tokenSchema,
  deleteBattle: schemas.deleteBattleSchema,
  createBattle: schemas.createBattleSchema,
  createLeagueBattle: schemas.createSealedEventBattleSchema,
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
