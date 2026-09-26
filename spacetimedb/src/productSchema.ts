import { table, t } from 'spacetimedb/server'

const userOnboarding = table(
  { name: 'user_onboarding' },
  {
    userId: t.string().primaryKey(),
    welcomed: t.bool(),
  },
)

const userOnboardingTasks = table(
  { name: 'user_onboarding_tasks' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    task: t.string(),
    state: t.string(),
  },
)

const battles = table(
  { name: 'battles' },
  {
    id: t.string().primaryKey(),
    token: t.string().unique(),
    createdAt: t.u64(),
  },
)

const battleUsers = table(
  { name: 'battle_users' },
  {
    key: t.string().primaryKey(),
    battleId: t.string().index('btree'),
    userId: t.string().index('btree'),
    side: t.u8(),
    joinedAt: t.u64(),
  },
)

const battleSharing = table(
  { name: 'battle_sharing' },
  {
    userId: t.string().primaryKey(),
    audience: t.string(),
    at: t.u64(),
  },
)

const pushPreferences = table(
  { name: 'push_preferences' },
  {
    userId: t.string().primaryKey(),
    enabled: t.bool(),
    at: t.u64(),
  },
)

const pushTokens = table(
  { name: 'push_tokens' },
  {
    token: t.string().primaryKey(),
    userId: t.string().index('btree'),
    platform: t.string(),
    createdAt: t.u64(),
    lastSeenAt: t.u64(),
  },
)

const friendships = table(
  { name: 'friendships' },
  {
    key: t.string().primaryKey(),
    requesterId: t.string().index('btree'),
    addresseeId: t.string().index('btree'),
    requestedAt: t.u64(),
    acceptedAt: t.option(t.u64()),
  },
)

const friendInvites = table(
  { name: 'friend_invites' },
  {
    token: t.string().primaryKey(),
    inviterId: t.string().unique(),
    createdAt: t.u64(),
  },
)

const commands = table(
  { name: 'commands' },
  {
    key: t.string().primaryKey(),
    battleId: t.string().index('btree'),
    seq: t.u32(),
    userId: t.string().index('btree'),
    at: t.u64(),
    body: t.string(),
  },
)

const rosters = table(
  { name: 'rosters' },
  {
    id: t.string().primaryKey(),
    userId: t.string().index('btree'),
    name: t.string(),
    catalogueId: t.string(),
    detachmentId: t.option(t.string()),
    disposition: t.option(t.string()),
    limit: t.u32(),
    picks: t.string(),
    prep: t.option(t.string()),
    tags: t.string(),
    waivedRules: t.string(),
    optionalRules: t.string(),
    borrowedDetachmentId: t.option(t.string()),
    visibility: t.string(),
    source: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  },
)

const leagues = table(
  { name: 'leagues' },
  {
    id: t.string().primaryKey(),
    token: t.string().unique(),
    ownerId: t.string().index('btree'),
    name: t.string(),
    description: t.string(),
    visibility: t.string(),
    admission: t.string(),
    playerLimit: t.option(t.u32()),
    recurring: t.bool(),
    createdAt: t.u64(),
  },
)

const leagueEvents = table(
  { name: 'league_events' },
  {
    id: t.string().primaryKey(),
    token: t.string().unique(),
    leagueId: t.string().index('btree'),
    number: t.u32(),
    format: t.option(t.string()),
    rosterLimit: t.option(t.u32()),
    createdAt: t.u64(),
    revealedAt: t.option(t.u64()),
  },
)

const leagueEventEntries = table(
  { name: 'league_event_entries' },
  {
    key: t.string().primaryKey(),
    eventId: t.string().index('btree'),
    userId: t.string().index('btree'),
    status: t.string(),
    joinedAt: t.u64(),
    rosterId: t.option(t.string()),
    rosterName: t.option(t.string()),
    rosterSnapshot: t.option(t.string()),
    submittedAt: t.option(t.u64()),
    requiredLimit: t.option(t.u32()),
    teamId: t.option(t.string()),
  },
)

const leagueEventBattles = table(
  { name: 'league_event_battles' },
  {
    battleId: t.string().primaryKey(),
    eventId: t.string().index('btree'),
  },
)

const collection = table(
  { name: 'collection' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    entryId: t.string(),
    at: t.u64(),
  },
)

const favouriteFactions = table(
  { name: 'favourite_factions' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    catalogueId: t.string(),
    at: t.u64(),
  },
)

const practiceOpponents = table(
  { name: 'practice_opponents' },
  {
    userId: t.string().primaryKey(),
  },
)

const favouriteDetachments = table(
  { name: 'favourite_detachments' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    catalogueId: t.string(),
    detachmentId: t.string(),
    at: t.u64(),
  },
)

export const productTables = {
  userOnboarding,
  userOnboardingTasks,
  battles,
  battleUsers,
  battleSharing,
  pushPreferences,
  pushTokens,
  friendships,
  friendInvites,
  commands,
  rosters,
  leagues,
  leagueEvents,
  leagueEventEntries,
  leagueEventBattles,
  collection,
  favouriteFactions,
  practiceOpponents,
  favouriteDetachments,
}
