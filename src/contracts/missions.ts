export type MissionAction = {
  name: string
  starts: string | null
  completes: string | null
  effect: string | null
  units: string | null
  useLimit: string | null
  restriction: string | null
}

export type WhenDrawn = {
  operation: 'redraw' | 'replace'
  roundMax: number | null
  required?: boolean
  heldCards: string[]
  condition: string | null
}

export type MissionTwist = {
  id: string
  name: string
  lore: string | null
  rules: string | null
  /** Whether its rules rewrite the Primary Mission cards, read from its words before they are published as a token. */
  changesPrimary?: boolean
}
