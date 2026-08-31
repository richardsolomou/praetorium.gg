/**
 * Who may look at a battle that is not theirs.
 *
 * A battle has two to four people in it, and each of them has answered how widely
 * their battles may be seen. This is the one place that turns those answers into
 * one answer, and it is the narrowest of them: a player who asked to be private
 * is private in every game they sit in, whoever else is at the table and however
 * they answered. Nothing else may decide this — the list of battles a stranger is
 * shown and the screen a stranger reaches through a link are the same question,
 * and two implementations of it is the leak this exists to prevent.
 */
export const BATTLE_AUDIENCES = ['public', 'friends', 'private'] as const

export type BattleAudience = (typeof BATTLE_AUDIENCES)[number]

/**
 * What a player who has never answered gets.
 *
 * Public: a battle is worth watching, and a game of Warhammer played in a room
 * with other people in it was never a secret. The narrower answers exist for the
 * players who want them, and `battleSharing` stores nothing until one is chosen.
 */
export const DEFAULT_BATTLE_AUDIENCE: BattleAudience = 'public'

/** Narrowest first, so a comparison is an index rather than a table of cases. */
const NARROWNESS: readonly BattleAudience[] = ['private', 'friends', 'public']

/**
 * The audience of a battle, from the answers its seats gave.
 *
 * A seat with no answer counts as the default. An empty table is private: a
 * battle with nobody in it is nobody's to watch.
 */
export function battleAudience(seats: readonly (BattleAudience | undefined)[]): BattleAudience {
  if (!seats.length) return 'private'
  return seats.reduce<BattleAudience>((narrowest, seat) => narrower(narrowest, seat ?? DEFAULT_BATTLE_AUDIENCE), 'public')
}

/** Whichever of two audiences shows the battle to fewer people. */
export function narrower(one: BattleAudience, other: BattleAudience): BattleAudience {
  return NARROWNESS.indexOf(one) <= NARROWNESS.indexOf(other) ? one : other
}

/**
 * Whether a viewer who holds no seat may read the battle.
 *
 * `friend` says whether the viewer is a confirmed friend of anyone seated. It is
 * asked for rather than worked out here because a friendship is a row in the
 * database and this file is the domain.
 */
export function maySpectate(audience: BattleAudience, viewer: { signedIn: boolean; friend: boolean }): boolean {
  if (audience === 'private') return false
  if (audience === 'public') return true
  return viewer.signedIn && viewer.friend
}
