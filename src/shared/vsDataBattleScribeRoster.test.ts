import { expect, it } from 'vitest'
import { type VsDataConstruction, vsDataDefinitions } from '../core/vsDataConstruction'
import { rosterXml } from './battleScribeXml'
import { vsDataUnitXml } from './vsDataBattleScribeRoster'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const weapon = (name: string, wargear: string) =>
  record(name, { unit: 'host.squad', wargear, range: 24, attacks: 1, skill: 3, strength: 4, armourPenetration: 0, damage: 1 })
const construction: VsDataConstruction = {
  release: 'test',
  rulesVersion: { edition: '11th', update: 'test' },
  unavailable: [],
  points: [],
  definitions: {
    faction: { host: record('Host', {}) },
    unit: { 'host.squad': record('Squad', { faction: 'host', keywords: ['INFANTRY', 'HOST'], factionKeywords: ['HOST'], sizes: [5] }) },
    model: {
      'host.squad.sergeant': record('Sergeant', { unit: 'host.squad', min: 1, max: 1, wargear: { 'host.squad.rifle': 1 } }),
      'host.squad.trooper': record('Trooper', { unit: 'host.squad', min: 4, max: 4, wargear: { 'host.squad.rifle': 1 } }),
    },
    'roster-option': {
      'host.squad.special': record('Special', {
        unit: 'host.squad',
        carrier: 'host.squad.trooper',
        choose: { min: 0, max: 1 },
        replaces: { 'host.squad.rifle': 1 },
        choices: ['host.squad.flamer'],
      }),
    },
    wargear: { 'host.squad.rifle': record('Rifle', {}), 'host.squad.flamer': record('Flamer', {}) },
    'weapon-profile': {
      'host.squad.rifle': weapon('Rifle', 'host.squad.rifle'),
      'host.squad.flamer': weapon('Flamer', 'host.squad.flamer'),
    },
  },
}
const picked = { unit: 'host.squad', options: { 'host.squad.special': { 'host.squad.flamer': 1 } } }
const xml = vsDataUnitXml(
  { picked, entryId: 'bs-squad', points: 100, abilities: [] },
  { faction: 'host', detachments: [], units: [picked] },
  vsDataDefinitions(construction),
)!

it('names the BSData game system Yellowscribe picks its 11th edition reader by', () => {
  expect(rosterXml({ name: 'List', catalogueId: 'book', catalogueName: 'Host', points: 100, units: [xml] })).toContain(
    'gameSystemId="sys-352e-adc2-7639-d610"',
  )
})

// Yellowscribe divides a weapon's number by its model stack's to arm each model.
it('numbers what a stack of models carries by the stack, a replaced weapon taken off', () => {
  expect(xml).toMatch(/name="Trooper" [^>]*number="4" type="model">.*?name="Rifle" [^>]*number="3"/)
})

it('marks a faction keyword as BattleScribe does, which Yellowscribe sorts keywords by', () => {
  expect(xml).toContain('name="Faction: HOST"')
})
