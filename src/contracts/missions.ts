/** An action a mission card names, by its VS Data ID; players read its summary. */
export type MissionAction = { id: string; name: string }

/**
 * What a secondary card lets a player do when it is drawn: put it back and draw another while the round or a paired
 * card allows, or discard it for another when the player judges, from its summary, that its condition holds.
 */
export type WhenDrawn = {
  operation: 'redraw' | 'replace'
  roundMax: number | null
  required?: boolean
  heldCards: string[]
  /** It may go back while no enemy model or unit has this characteristic at this value or more. */
  noEnemy?: { entity: 'model' | 'unit'; characteristic: 'wounds' | 'starting-strength'; min: number }
}

/** An optional twist a pack offers, by its VS Data ID; players read its summary. */
export type MissionTwist = {
  id: string
  name: string
  /** Whether it rewrites the Primary Mission cards. */
  changesPrimary?: boolean
}
