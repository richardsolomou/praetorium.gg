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
  heldCards: string[]
  condition: string | null
}
