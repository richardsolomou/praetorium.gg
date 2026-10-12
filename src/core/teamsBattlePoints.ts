/**
 * Teams Event Companion section 14: a player's battle points from their game's victory point difference.
 *
 * Every five points of difference beyond the first five moves one battle point from the trailing player
 * to the leader, so the two players' battle points always total 20.
 */
export function teamsBattlePoints(vp: number, opponentVp: number) {
  const margin = Math.min(10, Math.max(0, Math.ceil((Math.abs(vp - opponentVp) - 5) / 5)))
  return vp >= opponentVp ? 10 + margin : 10 - margin
}
