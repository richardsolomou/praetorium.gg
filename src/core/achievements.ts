/** Achievements are derived from what a player has done on every read; nothing records that one was earned. */

import { isGuestSeat } from './newBattle'
import { battleOutcome, counted, sideScore, type StandingBattle } from './standings'

export const ACHIEVEMENT_TIERS = { bronze: 10, silver: 25, gold: 50, platinum: 100 } as const
export type AchievementTier = keyof typeof ACHIEVEMENT_TIERS

/** What an achievement counts. Each reads as a list of times: when the count first reached one, two, and so on. */
export type AchievementMetric =
  | 'battles'
  | 'wins'
  | 'streak'
  | 'draws'
  | 'close-wins'
  | 'routs'
  | 'concessions'
  | 'team-wins'
  | 'opponents'
  | 'factions-faced'
  | 'armies'
  | 'rivalry'
  | 'photos'
  | 'likes'
  | 'recruits'
  | 'tournaments'
  | 'organised'
  | 'championships'
  | 'founded'
  | 'listed-battles'
  | 'guest-battles'
  | 'imports'
  | 'published'
  | 'club-battles'
  | 'seasons'
  | 'seasons-run'
  | 'seals'
  | 'collected'
  | 'painted'
  | 'wishes'
  | 'rosters'
  | 'loans'
  | 'friends'
  | 'likes-given'
  | 'simulations'
  | 'reminders'
  | 'loadouts'
  | 'favourites'
  | 'app'
  | 'practice'

type Definition = { id: string; name: string; tier: AchievementTier; metric: AchievementMetric; count: number; goal: string }

/** A win by this many points or fewer is close, and by this many or more a rout. */
const CLOSE_MARGIN = 3
const ROUT_MARGIN = 50

/** First steps across the app first, then each series in order from its first medal to its last. */
export const ACHIEVEMENTS = [
  { id: 'first-list', name: 'First List', tier: 'bronze', metric: 'rosters', count: 1, goal: 'Build a roster.' },
  { id: 'armoury', name: 'Armoury', tier: 'silver', metric: 'rosters', count: 10, goal: 'Build 10 rosters.' },
  { id: 'published', name: 'Published', tier: 'bronze', metric: 'published', count: 1, goal: 'Publish a roster for everyone to see.' },
  { id: 'showcase', name: 'Showcase', tier: 'silver', metric: 'published', count: 10, goal: 'Publish 10 rosters for everyone to see.' },
  { id: 'lend-lease', name: 'Lend-Lease', tier: 'silver', metric: 'loans', count: 1, goal: 'Lend one of your rosters to a friend.' },
  {
    id: 'battle-ready',
    name: 'Battle Ready',
    tier: 'bronze',
    metric: 'listed-battles',
    count: 1,
    goal: 'Play a leaderboard battle with an army from your rosters.',
  },
  { id: 'mathhammer', name: 'Mathhammer', tier: 'bronze', metric: 'simulations', count: 1, goal: 'Run a combat simulation.' },
  { id: 'drill', name: 'Drill', tier: 'bronze', metric: 'practice', count: 1, goal: 'Finish a practice battle.' },
  { id: 'open-table', name: 'Open Table', tier: 'bronze', metric: 'guest-battles', count: 1, goal: 'Finish a battle with a guest.' },
  {
    id: 'old-campaigns',
    name: 'Old Campaigns',
    tier: 'bronze',
    metric: 'imports',
    count: 1,
    goal: 'Bring in a battle you played on another tracker.',
  },
  { id: 'prepared', name: 'Prepared', tier: 'bronze', metric: 'reminders', count: 1, goal: 'Set an ability reminder.' },
  { id: 'kitted-out', name: 'Kitted Out', tier: 'bronze', metric: 'loadouts', count: 1, goal: 'Save a unit loadout.' },
  { id: 'devoted', name: 'Devoted', tier: 'bronze', metric: 'favourites', count: 1, goal: 'Favourite a faction, detachment or datasheet.' },
  {
    id: 'field-kit',
    name: 'Field Kit',
    tier: 'bronze',
    metric: 'app',
    count: 1,
    goal: 'Turn on notifications in the Praetorium mobile app.',
  },
  { id: 'comrade', name: 'Comrade', tier: 'bronze', metric: 'friends', count: 1, goal: 'Make a friend on Praetorium.' },
  { id: 'warband', name: 'Warband', tier: 'silver', metric: 'friends', count: 5, goal: 'Have 5 friends on Praetorium.' },
  { id: 'brotherhood', name: 'Brotherhood', tier: 'gold', metric: 'friends', count: 10, goal: 'Have 10 friends on Praetorium.' },
  { id: 'club-night', name: 'Club Night', tier: 'bronze', metric: 'club-battles', count: 1, goal: 'Play a battle for a club.' },
  {
    id: 'club-stalwart',
    name: 'Club Stalwart',
    tier: 'silver',
    metric: 'club-battles',
    count: 10,
    goal: 'Play 10 battles for your clubs.',
  },
  {
    id: 'pillar-of-the-club',
    name: 'Pillar of the Club',
    tier: 'gold',
    metric: 'club-battles',
    count: 25,
    goal: 'Play 25 battles for your clubs.',
  },
  { id: 'season-ticket', name: 'Season Ticket', tier: 'silver', metric: 'seasons', count: 1, goal: 'Play every fixture of a club season.' },
  {
    id: 'commissioner',
    name: 'Commissioner',
    tier: 'gold',
    metric: 'seasons-run',
    count: 1,
    goal: 'Run a club season until every fixture is played.',
  },
  {
    id: 'sealed-orders',
    name: 'Sealed Orders',
    tier: 'bronze',
    metric: 'seals',
    count: 1,
    goal: 'Seal a list for a tournament or club game.',
  },
  { id: 'collector', name: 'Collector', tier: 'bronze', metric: 'collected', count: 1, goal: 'Add models to your collection.' },
  { id: 'hoard', name: 'Hoard', tier: 'silver', metric: 'collected', count: 25, goal: 'Add 25 different datasheets to your collection.' },
  {
    id: 'first-coat',
    name: 'First Coat',
    tier: 'bronze',
    metric: 'painted',
    count: 10,
    goal: 'Mark 10 models in your collection as painted.',
  },
  { id: 'painter', name: 'Painter', tier: 'silver', metric: 'painted', count: 50, goal: 'Mark 50 models in your collection as painted.' },
  {
    id: 'master-painter',
    name: 'Master Painter',
    tier: 'gold',
    metric: 'painted',
    count: 200,
    goal: 'Mark 200 models in your collection as painted.',
  },
  {
    id: 'artisan',
    name: 'Artisan',
    tier: 'platinum',
    metric: 'painted',
    count: 500,
    goal: 'Mark 500 models in your collection as painted.',
  },
  { id: 'wishlist', name: 'Wishlist', tier: 'bronze', metric: 'wishes', count: 1, goal: 'Add a datasheet to your wishlist.' },
  { id: 'patron', name: 'Patron', tier: 'silver', metric: 'likes-given', count: 10, goal: "Like 10 of other players' collection photos." },
  {
    id: 'first-blood',
    name: 'First Blood',
    tier: 'bronze',
    metric: 'battles',
    count: 1,
    goal: 'Finish a battle that counts for the leaderboard.',
  },
  {
    id: 'campaigner',
    name: 'Campaigner',
    tier: 'bronze',
    metric: 'battles',
    count: 10,
    goal: 'Finish 10 battles that count for the leaderboard.',
  },
  {
    id: 'veteran',
    name: 'Veteran',
    tier: 'silver',
    metric: 'battles',
    count: 25,
    goal: 'Finish 25 battles that count for the leaderboard.',
  },
  {
    id: 'hardened',
    name: 'Hardened',
    tier: 'silver',
    metric: 'battles',
    count: 50,
    goal: 'Finish 50 battles that count for the leaderboard.',
  },
  {
    id: 'centurion',
    name: 'Centurion',
    tier: 'gold',
    metric: 'battles',
    count: 100,
    goal: 'Finish 100 battles that count for the leaderboard.',
  },
  {
    id: 'warlord',
    name: 'Warlord',
    tier: 'gold',
    metric: 'battles',
    count: 200,
    goal: 'Finish 200 battles that count for the leaderboard.',
  },
  {
    id: 'eternal',
    name: 'Eternal',
    tier: 'platinum',
    metric: 'battles',
    count: 500,
    goal: 'Finish 500 battles that count for the leaderboard.',
  },
  {
    id: 'first-victory',
    name: 'First Victory',
    tier: 'bronze',
    metric: 'wins',
    count: 1,
    goal: 'Win a battle that counts for the leaderboard.',
  },
  { id: 'victor', name: 'Victor', tier: 'bronze', metric: 'wins', count: 10, goal: 'Win 10 battles that count for the leaderboard.' },
  { id: 'conqueror', name: 'Conqueror', tier: 'silver', metric: 'wins', count: 25, goal: 'Win 25 battles that count for the leaderboard.' },
  { id: 'triumphant', name: 'Triumphant', tier: 'gold', metric: 'wins', count: 50, goal: 'Win 50 battles that count for the leaderboard.' },
  { id: 'legend', name: 'Legend', tier: 'platinum', metric: 'wins', count: 100, goal: 'Win 100 battles that count for the leaderboard.' },
  { id: 'unbroken', name: 'Unbroken', tier: 'silver', metric: 'streak', count: 5, goal: 'Win 5 leaderboard battles in a row.' },
  { id: 'relentless', name: 'Relentless', tier: 'gold', metric: 'streak', count: 10, goal: 'Win 10 leaderboard battles in a row.' },
  { id: 'inexorable', name: 'Inexorable', tier: 'gold', metric: 'streak', count: 15, goal: 'Win 15 leaderboard battles in a row.' },
  { id: 'unstoppable', name: 'Unstoppable', tier: 'platinum', metric: 'streak', count: 20, goal: 'Win 20 leaderboard battles in a row.' },
  { id: 'undying', name: 'Undying', tier: 'platinum', metric: 'streak', count: 100, goal: 'Win 100 leaderboard battles in a row.' },
  { id: 'stalemate', name: 'Stalemate', tier: 'bronze', metric: 'draws', count: 1, goal: 'Draw a leaderboard battle.' },
  {
    id: 'broken-will',
    name: 'Broken Will',
    tier: 'bronze',
    metric: 'concessions',
    count: 1,
    goal: 'Win a leaderboard battle by your opponent conceding.',
  },
  {
    id: 'brothers-in-arms',
    name: 'Brothers in Arms',
    tier: 'bronze',
    metric: 'team-wins',
    count: 1,
    goal: 'Win a team battle that counts for the leaderboard.',
  },
  {
    id: 'by-a-hair',
    name: 'By a Hair',
    tier: 'silver',
    metric: 'close-wins',
    count: 1,
    goal: `Win a leaderboard battle by ${CLOSE_MARGIN} points or fewer.`,
  },
  {
    id: 'annihilation',
    name: 'Annihilation',
    tier: 'silver',
    metric: 'routs',
    count: 1,
    goal: `Win a leaderboard battle by ${ROUT_MARGIN} points or more.`,
  },
  {
    id: 'many-foes',
    name: 'Many Foes',
    tier: 'silver',
    metric: 'opponents',
    count: 5,
    goal: 'Play leaderboard battles against 5 different players.',
  },
  {
    id: 'far-and-wide',
    name: 'Far and Wide',
    tier: 'gold',
    metric: 'opponents',
    count: 10,
    goal: 'Play leaderboard battles against 10 different players.',
  },
  {
    id: 'infamous',
    name: 'Infamous',
    tier: 'platinum',
    metric: 'opponents',
    count: 25,
    goal: 'Play leaderboard battles against 25 different players.',
  },
  {
    id: 'know-thy-enemy',
    name: 'Know Thy Enemy',
    tier: 'silver',
    metric: 'factions-faced',
    count: 5,
    goal: 'Face 5 different armies in leaderboard battles.',
  },
  {
    id: 'every-front',
    name: 'Every Front',
    tier: 'gold',
    metric: 'factions-faced',
    count: 10,
    goal: 'Face 10 different armies in leaderboard battles.',
  },
  {
    id: 'many-banners',
    name: 'Many Banners',
    tier: 'silver',
    metric: 'armies',
    count: 3,
    goal: 'Play 3 different armies in leaderboard battles.',
  },
  {
    id: 'old-rivals',
    name: 'Old Rivals',
    tier: 'silver',
    metric: 'rivalry',
    count: 10,
    goal: 'Play 10 leaderboard battles against the same player.',
  },
  {
    id: 'nemesis',
    name: 'Nemesis',
    tier: 'gold',
    metric: 'rivalry',
    count: 25,
    goal: 'Play 25 leaderboard battles against the same player.',
  },
  {
    id: 'on-display',
    name: 'On Display',
    tier: 'bronze',
    metric: 'photos',
    count: 1,
    goal: 'Show a photo of your models in your collection.',
  },
  {
    id: 'gallery',
    name: 'Gallery',
    tier: 'silver',
    metric: 'photos',
    count: 10,
    goal: 'Show 10 photos of your models in your collection.',
  },
  {
    id: 'exhibition',
    name: 'Exhibition',
    tier: 'gold',
    metric: 'photos',
    count: 25,
    goal: 'Show 25 photos of your models in your collection.',
  },
  {
    id: 'admired',
    name: 'Admired',
    tier: 'gold',
    metric: 'likes',
    count: 10,
    goal: 'Have one collection photo liked by 10 other players.',
  },
  {
    id: 'adored',
    name: 'Adored',
    tier: 'platinum',
    metric: 'likes',
    count: 25,
    goal: 'Have one collection photo liked by 25 other players.',
  },
  {
    id: 'recruiter',
    name: 'Recruiter',
    tier: 'silver',
    metric: 'recruits',
    count: 1,
    goal: 'Play someone as your guest who then signs up and claims their seat.',
  },
  {
    id: 'herald',
    name: 'Herald',
    tier: 'gold',
    metric: 'recruits',
    count: 3,
    goal: 'Bring in 3 guests who sign up and claim their seats.',
  },
  {
    id: 'muster',
    name: 'Muster',
    tier: 'platinum',
    metric: 'recruits',
    count: 10,
    goal: 'Bring in 10 guests who sign up and claim their seats.',
  },
  {
    id: 'contender',
    name: 'Contender',
    tier: 'bronze',
    metric: 'tournaments',
    count: 1,
    goal: 'Play a Swiss tournament through to its last round.',
  },
  {
    id: 'regular',
    name: 'Regular',
    tier: 'silver',
    metric: 'tournaments',
    count: 5,
    goal: 'Play 5 Swiss tournaments through to their last round.',
  },
  {
    id: 'circuit-veteran',
    name: 'Circuit Veteran',
    tier: 'gold',
    metric: 'tournaments',
    count: 10,
    goal: 'Play 10 Swiss tournaments through to their last round.',
  },
  {
    id: 'organiser',
    name: 'Organiser',
    tier: 'gold',
    metric: 'organised',
    count: 1,
    goal: 'Run a Swiss tournament of at least 4 players to its last round.',
  },
  {
    id: 'grand-marshal',
    name: 'Grand Marshal',
    tier: 'platinum',
    metric: 'organised',
    count: 5,
    goal: 'Run 5 Swiss tournaments of at least 4 players to their last round.',
  },
  {
    id: 'champion',
    name: 'Champion',
    tier: 'gold',
    metric: 'championships',
    count: 1,
    goal: 'Win a Swiss tournament of at least 8 players.',
  },
  {
    id: 'dynasty',
    name: 'Dynasty',
    tier: 'platinum',
    metric: 'championships',
    count: 3,
    goal: 'Win 3 Swiss tournaments of at least 8 players.',
  },
  {
    id: 'founder',
    name: 'Founder',
    tier: 'gold',
    metric: 'founded',
    count: 1,
    goal: 'Own a club with at least 4 members that has played 10 club battles.',
  },
] as const satisfies readonly Definition[]

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id']

/** A finished Swiss tournament as one of its organisers or entrants sees it. */
export type TournamentFact = { entrants: number; finishedAt: number; organised: boolean; played: boolean; won: boolean }

/** Every time is when the thing happened, which is when the achievement it completes was earned. */
export type AchievementFacts = {
  /** Finished battles the player sat in; only those the leaderboard counts are read. */
  battles: readonly StandingBattle[]
  /** Battles the player fought against a guest who then claimed their seat. */
  recruits: readonly number[]
  tournaments: readonly TournamentFact[]
  /** Clubs the player owns: when each member joined and when each club battle finished. */
  clubs: readonly { members: readonly number[]; battles: readonly number[] }[]
  /** The player's shown photos, with when each other player liked them. */
  photos: readonly { at: number; likes: readonly number[] }[]
  clubBattles: readonly number[]
  imports: readonly number[]
  /** Club seasons the player played every fixture of, and those they helped run to the end. */
  seasons: readonly number[]
  seasonsRun: readonly number[]
  seals: readonly number[]
  published: readonly number[]
  collected: readonly number[]
  /** How many models the collection marks painted; nothing records when each was. */
  painted: number
  wishes: readonly number[]
  /** Every roster the player built, private ones included. */
  rosters: readonly number[]
  loans: readonly number[]
  friends: readonly number[]
  likesGiven: readonly number[]
  simulations: readonly number[]
  reminders: readonly number[]
  loadouts: readonly number[]
  favourites: readonly number[]
  app: readonly number[]
}

/** When each was earned, or null when nothing records when. */
export type EarnedAchievements = { earned: Partial<Record<AchievementId, number | null>>; points: number }

const ascending = (times: readonly number[]) => times.toSorted((one, other) => one - other)

/** When the `count`th of these happened. */
const nth = (times: readonly number[], count: number) => ascending(times)[count - 1] ?? null

/** When the most of anything first reached each count, from each thing's own times. */
function best(groups: readonly (readonly number[])[]) {
  const sorted = groups.map(ascending)
  const length = Math.max(0, ...sorted.map((times) => times.length))
  return Array.from({ length }, (_, index) => Math.min(...sorted.flatMap((times) => (times[index] === undefined ? [] : [times[index]]))))
}

type BattleMetric =
  | 'battles'
  | 'wins'
  | 'streak'
  | 'draws'
  | 'close-wins'
  | 'routs'
  | 'concessions'
  | 'team-wins'
  | 'listed-battles'
  | 'opponents'
  | 'factions-faced'
  | 'armies'
  | 'rivalry'

/** Every milestone the player's leaderboard battles reach, read in the order they finished. */
function battleMetrics(battles: readonly StandingBattle[], playerId: string): Record<BattleMetric, readonly number[]> {
  const times = {
    battles: [],
    wins: [],
    streak: [],
    draws: [],
    'close-wins': [],
    routs: [],
    concessions: [],
    'team-wins': [],
    'listed-battles': [],
  }
  const firsts = { opponents: new Map<string, number>(), 'factions-faced': new Map<string, number>(), armies: new Map<string, number>() }
  const meetings = new Map<string, number[]>()
  const record = (metric: keyof typeof times, at: number) => (times[metric] as number[]).push(at)
  const meet = (metric: keyof typeof firsts, key: string | undefined, at: number) => {
    if (key !== undefined && !firsts[metric].has(key)) firsts[metric].set(key, at)
  }
  let streak = 0
  for (const battle of battles.toSorted((one, other) => one.lastActivity - other.lastActivity)) {
    const at = battle.lastActivity
    const seat = battle.playerIds.indexOf(playerId)
    const side = battle.sides[seat]!
    const outcome = battleOutcome(battle, side)
    record('battles', at)
    if (outcome === 'drawn') record('draws', at)
    if (outcome === 'won') {
      record('wins', at)
      const margin =
        sideScore(battle, side) - Math.max(...battle.sides.filter((other) => other !== side).map((other) => sideScore(battle, other)))
      if (battle.result?.concededBy) record('concessions', at)
      else if (margin <= CLOSE_MARGIN) record('close-wins', at)
      else if (margin >= ROUT_MARGIN) record('routs', at)
      if (battle.sides.filter((other) => other === side).length > 1) record('team-wins', at)
    }
    streak = outcome === 'won' ? streak + 1 : 0
    if (streak > times.streak.length) record('streak', at)
    if (battle.factions[seat]) record('listed-battles', at)
    meet('armies', battle.factions[seat]?.slug, at)
    for (const [other, id] of battle.playerIds.entries()) {
      if (battle.sides[other] === side) continue
      meet('opponents', id, at)
      meet('factions-faced', battle.factions[other]?.slug, at)
      meetings.set(id, [...(meetings.get(id) ?? []), at])
    }
  }
  return {
    ...times,
    opponents: [...firsts.opponents.values()],
    'factions-faced': [...firsts['factions-faced'].values()],
    armies: [...firsts.armies.values()],
    rivalry: best([...meetings.values()]),
  }
}

/** `exclude` names the practice opponents, as the leaderboard is given them. */
export function achievements(playerId: string, facts: AchievementFacts, exclude: readonly string[]): EarnedAchievements {
  const seated = facts.battles.filter((battle) => battle.status === 'finished' && battle.playerIds.includes(playerId))
  const rated = counted(seated, exclude)
  const practice = new Set(exclude)
  const tournaments = (test: (tournament: TournamentFact) => boolean) =>
    facts.tournaments.filter(test).map((tournament) => tournament.finishedAt)
  const founded = facts.clubs.flatMap((club) => {
    const members = nth(club.members, 4)
    const played = nth(club.battles, 10)
    return members === null || played === null ? [] : [Math.max(members, played)]
  })
  const metrics: Record<Exclude<AchievementMetric, 'painted'>, readonly number[]> = {
    ...battleMetrics(rated, playerId),
    'guest-battles': seated.filter((battle) => battle.playerIds.some(isGuestSeat)).map((battle) => battle.lastActivity),
    practice: seated.filter((battle) => battle.playerIds.some((id) => practice.has(id))).map((battle) => battle.lastActivity),
    photos: facts.photos.map((photo) => photo.at),
    likes: best(facts.photos.map((photo) => photo.likes)),
    recruits: facts.recruits,
    tournaments: tournaments((tournament) => tournament.played),
    organised: tournaments((tournament) => tournament.organised && tournament.entrants >= 4),
    championships: tournaments((tournament) => tournament.won && tournament.entrants >= 8),
    founded,
    imports: facts.imports,
    published: facts.published,
    'club-battles': facts.clubBattles,
    seasons: facts.seasons,
    'seasons-run': facts.seasonsRun,
    seals: facts.seals,
    collected: facts.collected,
    wishes: facts.wishes,
    rosters: facts.rosters,
    loans: facts.loans,
    friends: facts.friends,
    'likes-given': facts.likesGiven,
    simulations: facts.simulations,
    reminders: facts.reminders,
    loadouts: facts.loadouts,
    favourites: facts.favourites,
    app: facts.app,
  }
  const earned: Partial<Record<AchievementId, number | null>> = {}
  let points = 0
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.metric === 'painted') {
      if (facts.painted >= achievement.count) earned[achievement.id] = null
    } else {
      const at = nth(metrics[achievement.metric], achievement.count)
      if (at === null) continue
      earned[achievement.id] = at
    }
    if (earned[achievement.id] !== undefined) points += ACHIEVEMENT_TIERS[achievement.tier]
  }
  return { earned, points }
}
