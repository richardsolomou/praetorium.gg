/**
 * The pieces every battle test builds a game out of.
 *
 * Two named players, a log the way the repository writes one, and the shortest route
 * to a battle that has already begun. Imported only by tests, so nothing here ships.
 */

import type { Command, LoggedCommand, UnitFormation } from './battle'
import type { battleReport } from './battleReport'

export const ALICE = 'alice'
export const BOB = 'bob'
export const CAROL = 'carol'
export const PLAYERS = [ALICE, BOB]
export const NAMES = [
  { id: ALICE, name: 'Alice' },
  { id: BOB, name: 'Bob' },
]

/** Builds a log the way the repository does: sequential seqs, nothing skipped. */
export function log(...entries: [PlayerId: string, command: Command][]): LoggedCommand[] {
  return entries.map(([by, command], index) => ({ seq: index + 1, by, at: index, command }))
}

export const roster = (name: string): Command => ({ kind: 'attach-roster', roster: { name, text: '10 Intercessors' } })

/**
 * A list built from the catalogue, whose units the battle can then track.
 *
 * `wounds` is left out by default, because most of what is tested here is a squad
 * counted in models, and a datasheet whose models disagree records none.
 */
export const builtRoster = (name: string, units: string[], each: { models?: number; wounds?: number } = {}): Command => ({
  kind: 'attach-roster',
  roster: {
    name,
    text: units.join('\n'),
    built: {
      catalogueId: 'cat',
      revision: 'rev',
      limit: 2000,
      detachment: 'Flyblown Host',
      disposition: 'reconnaissance',
      units: units.map((unit, index) => ({
        key: `u${index}`,
        name: unit,
        points: 100,
        models: each.models ?? 5,
        ...(each.wounds === undefined ? {} : { wounds: each.wounds }),
      })),
    },
  },
})

/**
 * A bodyguard unit and the character who joined it, which the game plays as one unit.
 *
 * `formations` is what each datasheet says on its own, so a test can give the
 * character somewhere to be that the unit he joined cannot follow him to.
 */
export const attachedRoster = (formations: { marines: UnitFormation[]; lord: UnitFormation[] } = { marines: [], lord: [] }): Command => ({
  kind: 'attach-roster',
  roster: {
    name: 'Death Guard',
    text: 'Plague Marines\nLord of Contagion',
    built: {
      catalogueId: 'cat',
      revision: 'rev',
      limit: 2000,
      detachment: 'Flyblown Host',
      disposition: 'reconnaissance',
      units: [
        { key: 'u0', name: 'Plague Marines', points: 100, models: 5, group: 'battleline', formationOptions: formations.marines },
        {
          key: 'u1',
          name: 'Lord of Contagion',
          points: 100,
          models: 1,
          group: 'character',
          attachedTo: 'u0',
          formationOptions: formations.lord,
        },
      ],
    },
  },
})

export const advance = (): Command => ({ kind: 'advance' })

/** Both lists in, Alice going first. */
export const started = (): [string, Command][] => [
  [ALICE, roster('Ultramarines')],
  [BOB, roster('Death Guard')],
  [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
]

export const turns = (count: number, by: string): [string, Command][] => Array.from({ length: count }, () => [by, advance()])

/** Just the sentences, which is what a report assertion is actually about. */
export const text = (entries: ReturnType<typeof battleReport>) => entries.map((entry) => entry.text)
