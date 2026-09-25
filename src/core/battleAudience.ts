/** Use every seat's narrowest choice for both battle lists and linked screens. */
export const BATTLE_AUDIENCES = ['public', 'friends', 'private'] as const

export type BattleAudience = (typeof BATTLE_AUDIENCES)[number]

/** An absent sharing choice is public. */
export const DEFAULT_BATTLE_AUDIENCE: BattleAudience = 'public'

/** Narrowest first, so a comparison is an index rather than a table of cases. */
const NARROWNESS: readonly BattleAudience[] = ['private', 'friends', 'public']

/** An empty table is private; seats without a choice use the default. */
export function battleAudience(seats: readonly (BattleAudience | undefined)[]): BattleAudience {
  if (!seats.length) return 'private'
  return seats.reduce<BattleAudience>((narrowest, seat) => narrower(narrowest, seat ?? DEFAULT_BATTLE_AUDIENCE), 'public')
}

/** Whichever of two audiences shows the battle to fewer people. */
export function narrower(one: BattleAudience, other: BattleAudience): BattleAudience {
  return NARROWNESS.indexOf(one) <= NARROWNESS.indexOf(other) ? one : other
}

/** `friend` is resolved by the caller because friendship is stored outside core. */
export function maySpectate(audience: BattleAudience, viewer: { signedIn: boolean; friend: boolean }): boolean {
  if (audience === 'private') return false
  if (audience === 'public') return true
  return viewer.signedIn && viewer.friend
}
