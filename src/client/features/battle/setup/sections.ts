import type { Command } from '../../../../core/battle'

/** In the log's order: a tick stores a step's index, so a step is never moved or removed, only renamed in place. */
export const SECTION_IDS = [
  'format',
  'opponent',
  'mission',
  'battlefield',
  'defender',
  'secondaries',
  'reserves',
  'deploy',
  'first-turn',
  'pre-battle',
] as const
export type SectionId = (typeof SECTION_IDS)[number]

/** Changes some battle settings, sending the rest as they stand, and runs `then` once the change is appended. */
export type Configure = (settings: Partial<Omit<Extract<Command, { kind: 'configure-battle' }>, 'kind'>>, then?: () => void) => void
