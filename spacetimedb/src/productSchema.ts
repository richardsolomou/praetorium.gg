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

/** A battle copied from another tracker, keyed by the source and its own battle id so it is copied once, whichever of its players brings it. */
const battleImports = table(
  { name: 'battle_imports' },
  {
    battleId: t.string().primaryKey(),
    key: t.string().unique(),
  },
)

/** Which source player sat in each seat of a copied battle, so the seat can find its player's account whenever they link one. */
const importedSeats = table(
  { name: 'imported_seats' },
  {
    key: t.string().primaryKey(),
    battleId: t.string().index('btree'),
    player: t.string().index('btree'),
  },
)

/** An account on another tracker that a player proved is theirs, keyed by `externalPlayerKey`. */
const externalAccounts = table(
  { name: 'external_accounts' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    name: t.string(),
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

/**
 * Retired: each league became a club and each of its events a club game. The server empties these at its start, and
 * SpacetimeDB refuses to drop a table that still holds rows, so they stay until a later release.
 */
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
    clubId: t.option(t.string()).default(undefined),
  },
)

/** Retired with `leagues`. */
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
    allowances: t.option(t.string()).default(undefined),
    rounds: t.option(t.u32()).default(undefined),
    pointsBudget: t.option(t.u32()).default(undefined),
    playsAt: t.option(t.u64()).default(undefined),
    sealBy: t.option(t.u64()).default(undefined),
  },
)

/** Retired with `leagues`. */
const leagueAdmins = table(
  { name: 'league_admins' },
  {
    key: t.string().primaryKey(),
    leagueId: t.string().index('btree'),
    userId: t.string().index('btree'),
    addedAt: t.u64(),
  },
)

/**
 * One sealed-roster event, which either a tournament or a club game hosts; its entries, picks, pairings and battles
 * are keyed by its id.
 */
const sealedEvents = table(
  { name: 'sealed_events' },
  {
    id: t.string().primaryKey(),
    token: t.string().unique(),
    format: t.option(t.string()),
    rosterLimit: t.option(t.u32()),
    /** JSON `LeagueAllowance[]`; absent on events created before organizers chose them, which accept any waiver. */
    allowances: t.option(t.string()),
    /** How many Swiss rounds the organizer pairs; absent for open play, where entrants choose their own opponents. */
    rounds: t.option(t.u32()),
    /** A duel's points total when it differs from its battle size's, as a roster's own budget would set it. */
    pointsBudget: t.option(t.u32()),
    /** When the event is played, as the organizer announced it. */
    playsAt: t.option(t.u64()),
    /** The roster deadline: after it nobody seals, and entrants without a sealed list drop out. */
    sealBy: t.option(t.u64()),
    createdAt: t.u64(),
    revealedAt: t.option(t.u64()),
    revealedBy: t.option(t.string()),
    /** What a 2v1's solo player may spend; absent spends the battle size. */
    soloPoints: t.option(t.u32()).default(undefined),
    /** What each ally in a 2v1, or each doubles player, may spend; absent spends half the battle size. */
    allyPoints: t.option(t.u32()).default(undefined),
    /** When an organizer last reminded the entrants without a sealed list, which spaces out the next reminder. */
    remindedAt: t.option(t.u64()).default(undefined),
    /** Allies spend their pair's points between them in any split; absent spends each ally's own. */
    sharedPoints: t.option(t.bool()).default(undefined),
  },
)

/** An organized one-off event: its name, who may find and enter it, and who runs it. */
const tournaments = table(
  { name: 'tournaments' },
  {
    id: t.string().primaryKey(),
    token: t.string().unique(),
    eventId: t.string().unique(),
    ownerId: t.string().index('btree'),
    name: t.string(),
    description: t.string(),
    visibility: t.string(),
    admission: t.string(),
    playerLimit: t.option(t.u32()),
    createdAt: t.u64(),
  },
)

/** Players the owner trusts to run a tournament beside them; the owner alone deletes it or changes who these are. */
const tournamentAdmins = table(
  { name: 'tournament_admins' },
  {
    key: t.string().primaryKey(),
    tournamentId: t.string().index('btree'),
    userId: t.string().index('btree'),
    addedAt: t.u64(),
  },
)

/** A club's casual hidden-list game: the club's organizers run it and only its members play. Its address is its event's token. */
const clubGames = table(
  { name: 'club_games' },
  {
    eventId: t.string().primaryKey(),
    clubId: t.string().index('btree'),
    creatorId: t.string(),
    createdAt: t.u64(),
    timeZone: t.option(t.string()).default(undefined),
    supersededAt: t.option(t.u64()).default(undefined),
  },
)

/**
 * One table of one Swiss round or one club season fixture, keyed by event or season, round and table. `bId` is absent
 * for a bye.
 */
const leagueRoundPairings = table(
  { name: 'league_round_pairings' },
  {
    key: t.string().primaryKey(),
    eventId: t.string().index('btree'),
    round: t.u32(),
    table: t.u32(),
    aId: t.string(),
    bId: t.option(t.string()),
    battleId: t.option(t.string()),
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
    /** When a revealed Swiss entrant withdrew or was dropped: they are never paired again and can't rejoin. */
    droppedAt: t.option(t.u64()).default(undefined),
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

/** The battles a sealed event or a club season started, keyed by battle. */
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

/**
 * A club's round robin, at most one per club. Its draft draws from `seed` and whoever has joined; publishing writes the
 * fixtures to `league_round_pairings`. `deadlines` is a JSON array of each round's deadline or null.
 */
const clubSeasons = table(
  { name: 'club_seasons' },
  {
    id: t.string().primaryKey(),
    clubId: t.string().unique(),
    seed: t.u32(),
    createdAt: t.u64(),
    publishedAt: t.option(t.u64()),
    deadlines: t.option(t.string()),
  },
)

/** Keyed by season and user. Withdrawing keeps the row, so played results stay on the table. */
const clubSeasonPlayers = table(
  { name: 'club_season_players' },
  {
    key: t.string().primaryKey(),
    seasonId: t.string().index('btree'),
    userId: t.string().index('btree'),
    joinedAt: t.u64(),
    withdrawn: t.bool(),
  },
)

/** Retired: a database that ran the first league migration records it here, and SpacetimeDB refuses to drop a table holding rows. */
const completedMigrations = table(
  { name: 'completed_migrations' },
  {
    name: t.string().primaryKey(),
    at: t.u64(),
  },
)

/** Which battles count on which club's table: an index of each battle's folded `set-battle-club`, rewritten whenever one could change it. */
const clubBattles = table(
  { name: 'club_battles' },
  {
    battleId: t.string().primaryKey(),
    clubId: t.string().index('btree'),
  },
)

/** When each battle last had a command, so a battle feed orders battles without reading every log; filled lazily by `lastActivity` and dropped by `touchBattle`. */
const battleActivity = table(
  { name: 'battle_activity' },
  {
    battleId: t.string().primaryKey(),
    at: t.u64(),
  },
)

/**
 * The `battles` revision at which each battle's log or seats last changed, so a reader keeping its own copy of results
 * rereads only what changed since it last read. The row outlives its battle, which tells that reader it is gone.
 */
const battleChanges = table(
  { name: 'battle_changes' },
  {
    battleId: t.string().primaryKey(),
    revision: t.u64().index('btree'),
  },
)

/**
 * Each finished battle's result as the operator folded it from the log, so the leaderboard and achievements read one
 * row per battle rather than folding logs. The operator rewrites it whenever `battle_changes` names the battle.
 */
const battleResults = table(
  { name: 'battle_results' },
  {
    battleId: t.string().primaryKey(),
    finishedAt: t.u64(),
    /** The UTC day it finished on, so the battles since a time are found a day at a time. */
    finishedDay: t.u32().index('btree'),
    /** JSON: seats, sides, scores, concession, armies and whether it was tracked by hand. */
    result: t.string(),
  },
)

/**
 * One seat's rating and record in one table right after one counted battle: `table` is '' for the overall table and an
 * army's slug for its own. Written by the operator in the order battles finished; a change to an older battle rewrites
 * every step from it on.
 */
const ratingSteps = table(
  { name: 'rating_steps' },
  {
    key: t.string().primaryKey(),
    battleId: t.string().index('btree'),
    playerId: t.string().index('btree'),
    holder: t.string().index('btree'),
    table: t.string(),
    finishedAt: t.u64(),
    finishedDay: t.u32().index('btree'),
    mu: t.f64(),
    sigma: t.f64(),
    rating: t.i32(),
    change: t.i32(),
    battles: t.u32(),
    won: t.u32(),
    lost: t.u32(),
    drawn: t.u32(),
    points: t.f64(),
  },
)

/** Each player's latest step in each table they have played in, which is what the leaderboard lists. */
const standings = table(
  { name: 'standings' },
  {
    holder: t.string().primaryKey(),
    table: t.string().index('btree'),
    playerId: t.string().index('btree'),
    battleId: t.string(),
    finishedAt: t.u64(),
    mu: t.f64(),
    sigma: t.f64(),
    rating: t.i32(),
    battles: t.u32(),
    won: t.u32(),
    lost: t.u32(),
    drawn: t.u32(),
    points: t.f64(),
  },
)

/**
 * How far the operator's derived tables have caught up. The `standings` row holds the `battle_changes` revision read up
 * to, the `standings` signal revision it was current with, the results `version` and `ratings` version they were derived
 * with and when either last changed, the finish ratings must be replayed from and how often that was asked for, and which
 * server holds the refresh. The `achievements` row's `version` is the definitions every stored medal was checked against.
 */
const derivedState = table(
  { name: 'derived_state' },
  {
    name: t.string().primaryKey(),
    cursor: t.u64(),
    seen: t.u64(),
    version: t.string(),
    ratings: t.string(),
    versionsAt: t.u64(),
    ratingsFrom: t.option(t.u64()),
    replays: t.u64(),
    holder: t.string(),
    heldUntil: t.u64(),
  },
)

/**
 * Whether a player's medals need checking again: `revision` rises with every write that could change what they have
 * earned, and `checked` is the revision their medals were last checked at. A quiet check stores new medals as seen.
 */
const achievementChecks = table(
  { name: 'achievement_checks' },
  {
    userId: t.string().primaryKey(),
    revision: t.u64(),
    checked: t.u64(),
    quiet: t.bool(),
  },
)

/**
 * The medals a player has earned, when, and whether they have been told. A medal they lose stays, no longer `held`, so
 * earning it again is not announced again.
 */
const earnedAchievements = table(
  { name: 'earned_achievements' },
  {
    key: t.string().primaryKey(),
    userId: t.string().index('btree'),
    achievementId: t.string(),
    earnedAt: t.option(t.u64()),
    held: t.bool(),
    seen: t.bool(),
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
  leagueAdmins,
  sealedEvents,
  tournaments,
  tournamentAdmins,
  clubGames,
  leagueEventEntries,
  leagueEventTeams,
  leagueEventTeamWarlords,
  leagueRosterSharing,
  leagueEventBattles,
  leagueRoundPairings,
  clubs,
  clubMembers,
  clubBattles,
  battleActivity,
  battleChanges,
  battleResults,
  ratingSteps,
  standings,
  derivedState,
  achievementChecks,
  earnedAchievements,
  clubSeasons,
  clubSeasonPlayers,
  completedMigrations,
  collection,
  collectionWishes,
  collectionStock,
  collectionPhotos,
  collectionPhotoDeletions,
  collectionPhotoLikes,
  favouriteFactions,
  practiceOpponents,
  battleImports,
  importedSeats,
  externalAccounts,
  favouriteDetachments,
  favouriteDatasheets,
  unitLoadouts,
  recentMatchups,
  abilityReminders,
  productRevisions,
  publicRevisions,
}
