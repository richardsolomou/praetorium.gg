import { describe, expect, it } from 'vitest'
import type { UnitState } from '../../../core/battle'
import { battleCombatRoster } from './battleCombatRoster'

const unit = (index: number, entryId: string, over: Partial<UnitState> = {}): UnitState => ({
  key: `${index}-${entryId}`,
  entryId,
  name: entryId,
  points: 100,
  models: 5,
  alive: 3,
  damage: 1,
  wounds: 2,
  destroyed: false,
  deployed: true,
  formation: 'battlefield',
  ...over,
})
const player = () => ({
  name: 'Player',
  roster: {
    name: 'Army',
    text: '',
    built: {
      catalogueId: 'faction',
      revision: 'rev',
      limit: 2000,
      detachment: 'Detachment',
      disposition: 'disposition',
      detachmentIds: ['detachment'],
      picks: [{ entryId: 'dead' }, { entryId: 'squad', models: 5, choices: { weapon: 'rifle' } }, { entryId: 'leader', attachedTo: 1 }],
      units: [],
    },
  },
  units: [unit(0, 'dead', { destroyed: true, alive: 0 }), unit(1, 'squad'), unit(2, 'leader', { models: 1, alive: 1, damage: 0 })],
})

describe('battle combat rosters', () => {
  it('keeps the frozen loadout and detachment while carrying live health separately', () => {
    const roster = battleCombatRoster(player())!
    expect({ pick: roster.picks[1], detachments: roster.detachmentIds, health: roster.battle?.units[1] }).toEqual({
      pick: { entryId: 'squad', models: 5, choices: { weapon: 'rifle' }, attachedTo: undefined },
      detachments: ['detachment'],
      health: { key: '1-squad', available: true, name: 'squad', models: 3, startingModels: 5, damage: 1, wounds: 2 },
    })
  })
  it('preserves frozen attachment indices and starts on a living unit', () =>
    expect({ attachedTo: battleCombatRoster(player())!.picks[2]!.attachedTo, selected: battleCombatRoster(player())!.pickIndex }).toEqual({
      attachedTo: 1,
      selected: 1,
    }))
  it('removes the attachment when its bodyguard is gone', () => {
    const value = player()
    value.units[1] = unit(1, 'squad', { destroyed: true, alive: 0 })
    expect(battleCombatRoster(value)!.picks[2]!.attachedTo).toBeUndefined()
  })
  it('excludes units in reserves and their buffs', () => {
    const value = player()
    value.units[2]!.formation = 'deep-strike'
    expect(battleCombatRoster(value)!.battle?.units.map((member) => member.available)).toEqual([false, true, false])
  })
  it('does not invent loadouts for old text-only armies', () =>
    expect(battleCombatRoster({ name: 'Player', units: [], roster: { name: 'Army', text: 'Squad' } })).toBeNull())
  it('does not mutate frozen attachments', () => {
    const value = player()
    battleCombatRoster(value)
    expect(value.roster.built.picks[2]!.attachedTo).toBe(1)
  })
})
