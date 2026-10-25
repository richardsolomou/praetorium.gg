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
    /** Set only on a guest's seat: the name its host gave someone without an account. */
    guestName: t.option(t.string()).default(undefined),
    /** Set only on an account that claimed a guest seat: the seat its commands were logged as, which every read resolves to this account. */
    claimedSeat: t.option(t.string()).default(undefined),
  },
)

/**
 * The link a host shares so a guest can play their own seat, and the one device that took it.
 * Only a hash of the device's secret is kept, so reading this table never lets anyone act as the guest.
 */
const guestSeats = table(
  { name: 'guest_seats' },
  {
    seatId: t.string().primaryKey(),
    battleId: t.string().index('btree'),
    invite: t.string().unique(),
    deviceHash: t.option(t.string()),
    joinedAt: t.option(t.u64()),
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

const playerDefaults = table(
  { name: 'player_defaults' },
  {
    userId: t.string().primaryKey(),
    rosterVisibility: t.string(),
    battleSize: t.u32(),
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
    visibility: t.string().index('btree'),
    source: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
    automaticName: t.option(t.bool()).default(undefined),
    baseRosterId: t.option(t.string()).default(undefined),
    locked: t.option(t.bool()).default(undefined),
    pointsBudget: t.option(t.u32()).default(undefined),
    copiedFromRosterId: t.option(t.string()).default(undefined),
    archived: t.option(t.bool()).default(undefined),
  },
)

const rosterLoans = table(
  { name: 'roster_loans' },
  {
    key: t.string().primaryKey(),
    rosterId: t.string().index('btree'),
    ownerId: t.string(),
    borrowerId: t.string().index('btree'),
    lentAt: t.u64(),
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
    /** The club this tournament runs inside; absent for a stand-alone one. */
    clubId: t.option(t.string()).default(undefined),
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
    revealedBy: t.option(t.string()).default(undefined),
    /** JSON `LeagueAllowance[]`; absent on events created before organizers chose them, which accept any waiver. */
    allowances: t.option(t.string()).default(undefined),
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

/** The Force Disposition a fixed pair chose before reveal, keyed by event and team; a pick its sealed lists no longer offer counts for nothing. */
const leagueEventTeams = table(
  { name: 'league_event_teams' },
  {
    key: t.string().primaryKey(),
    eventId: t.string().index('btree'),
    teamId: t.string(),
    disposition: t.string(),
  },
)

/** Whose Warlord leads a fixed pair, chosen before reveal, keyed by event and team; a pick for an entrant no longer on the team counts for nothing. */
const leagueEventTeamWarlords = table(
  { name: 'league_event_team_warlords' },
  {
    key: t.string().primaryKey(),
    eventId: t.string().index('btree'),
    teamId: t.string(),
    userId: t.string(),
  },
)

const leagueRosterSharing = table(
  { name: 'league_roster_sharing' },
  {
    key: t.string().primaryKey(),
    eventId: t.string().index('btree'),
    userId: t.string().index('btree'),
    rosterId: t.option(t.string()),
  },
)

/** Players the owner trusts to run the league beside them; the owner alone deletes it or changes who these are. */
const leagueAdmins = table(
  { name: 'league_admins' },
  {
    key: t.string().primaryKey(),
    leagueId: t.string().index('btree'),
    userId: t.string().index('btree'),
    addedAt: t.u64(),
  },
)

const leagueEventBattles = table(
  { name: 'league_event_battles' },
  {
    battleId: t.string().primaryKey(),
    eventId: t.string().index('btree'),
  },
)

const clubs = table(
  { name: 'clubs' },
  {
    id: t.string().primaryKey(),
    token: t.string().unique(),
    ownerId: t.string().index('btree'),
    name: t.string(),
    description: t.string(),
    visibility: t.string(),
    admission: t.string(),
    createdAt: t.u64(),
  },
)

/** Keyed by club and user. The owner holds an accepted row too, so "every player is a member" is one check; an admin is always a member. */
const clubMembers = table(
  { name: 'club_members' },
  {
    key: t.string().primaryKey(),
    clubId: t.string().index('btree'),
    userId: t.string().index('btree'),
    status: t.string(),
    role: t.string(),
    joinedAt: t.u64(),
  },
)

/** Which battles count on which club's table: an index of each battle's folded `set-battle-club`, rewritten whenever one could change it. */
/** One-off data migrations already applied, by name, so the server can ask for each at every start. */
const completedMigrations = table(
  { name: 'completed_migrations' },
  {
    name: t.string().primaryKey(),
    at: t.u64(),
  },
)

const clubBattles = table(
  { name: 'club_battles' },
  {
    battleId: t.string().primaryKey(),
    clubId: t.string().index('btree'),
  },
)

/** Retired roster-tied stock. SpacetimeDB refuses to drop a table that still holds rows, so it stays until it is emptied. */
const collectionStock = table(
  { name: 'collection_stock' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    lot: t.string(),
  },
)

const collection = table(
  { name: 'collection' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    entryId: t.string(),
    at: t.u64(),
    models: t.option(t.u32()).default(undefined),
    built: t.option(t.u32()).default(undefined),
    painted: t.option(t.u32()).default(undefined),
    /** Other datasheets the player says these models also count as, such as a magnetised hull's variants. */
    countsAs: t.option(t.array(t.string())).default(undefined),
  },
)

/** Models a player wants beyond those they own, kept apart so a wish never counts as ownership. */
const collectionWishes = table(
  { name: 'collection_wish' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    entryId: t.string(),
    wanted: t.u32(),
    at: t.u64(),
  },
)

/**
 * A collection row's photos, each naming its row by `key`; `photoId` names the private object.
 *
 * The row index is named because `key` was once unique, and a migration keeps a column index of the same name unique.
 */
const collectionPhotos = table(
  { name: 'collection_photo', indexes: [{ accessor: 'row', name: 'collection_photo_row', algorithm: 'btree', columns: ['key'] }] },
  {
    photoId: t.string().primaryKey(),
    key: t.string(),
    userId: t.string().index('btree'),
    entryId: t.string().index('btree'),
    at: t.u64(),
    /** How many `collection_photo_like` rows name this photo, kept in the same transactions. */
    likes: t.option(t.u32()).default(undefined),
    /** `held` from a player's report until an administrator keeps it; a report on a `kept` photo makes it `flagged`, still shown, until kept again. */
    review: t.option(t.string()).default(undefined),
  },
)

const collectionPhotoLikes = table(
  { name: 'collection_photo_like' },
  {
    key: t.string().primaryKey(),
    photoId: t.string().index('btree'),
    userId: t.string().index('btree'),
    at: t.u64(),
  },
)

/** Photos whose rows are gone and whose stored objects the web server has still to delete. */
const collectionPhotoDeletions = table({ name: 'collection_photo_deletion' }, { photoId: t.string().primaryKey() })

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

const favouriteDatasheets = table(
  { name: 'favourite_datasheets' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    entryId: t.string(),
    at: t.u64(),
  },
)

const unitLoadouts = table(
  { name: 'unit_loadouts' },
  {
    id: t.string().primaryKey(),
    userId: t.string().index('btree'),
    name: t.string(),
    catalogueId: t.string(),
    pick: t.string(),
    createdAt: t.u64(),
    joined: t.option(t.string()).default(undefined),
  },
)

const recentMatchups = table(
  { name: 'recent_matchups' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    shared: t.string(),
    attacker: t.string(),
    defender: t.string(),
    at: t.u64(),
  },
)

const abilityReminders = table(
  { name: 'ability_reminders' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    reminder: t.string(),
    updatedAt: t.u64(),
  },
)

const productRevisions = table(
  { name: 'product_revisions' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    scope: t.string(),
    revision: t.u64(),
  },
)

const publicRevisions = table(
  { name: 'public_revisions' },
  {
    scope: t.string().primaryKey(),
    revision: t.u64(),
  },
)

const rosterSync = table(
  { name: 'roster_sync' },
  {
    id: t.string().primaryKey(),
    userId: t.string().index('btree'),
    operationId: t.string(),
    fingerprint: t.string(),
    version: t.u64(),
    deleted: t.bool(),
  },
)

const syncReceipts = table(
  { name: 'sync_receipts' },
  {
    id: t.string().primaryKey(),
    owner: t.string().index('btree'),
    fingerprint: t.string(),
    createdAt: t.u64(),
    result: t.string(),
    outcome: t.string(),
    message: t.string(),
  },
)

export const productTables = {
  syncReceipts,
  rosterSync,
  userOnboarding,
  userOnboardingTasks,
  battles,
  battleUsers,
  guestSeats,
  pushPreferences,
  playerDefaults,
  pushTokens,
  friendships,
  friendInvites,
  commands,
  rosters,
  rosterLoans,
  leagues,
  leagueEvents,
  leagueEventEntries,
  leagueEventTeams,
  leagueEventTeamWarlords,
  leagueRosterSharing,
  leagueEventBattles,
  leagueAdmins,
  clubs,
  clubMembers,
  clubBattles,
  completedMigrations,
  collection,
  collectionWishes,
  collectionStock,
  collectionPhotos,
  collectionPhotoDeletions,
  collectionPhotoLikes,
  favouriteFactions,
  practiceOpponents,
  favouriteDetachments,
  favouriteDatasheets,
  unitLoadouts,
  recentMatchups,
  abilityReminders,
  productRevisions,
  publicRevisions,
}
