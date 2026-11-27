import { vsDataDefinitions } from './vsDataConstruction'

/** A small book: a squad whose sergeant and troopers swap rifles, a Character, a band of two freely counted models. */
const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
export const definitions = vsDataDefinitions({
  release: 'test',
  rulesVersion: { edition: '11th', update: 'test' },
  unavailable: [],
  points: [],
  definitions: {
    faction: { host: record('Host', {}), titans: record('Titans', { withoutDetachments: { warlords: ['titans.walker.walker'] } }) },
    detachment: { 'host.vanguard': record('Vanguard', { faction: 'host' }), 'host.rearguard': record('Rearguard', { faction: 'host' }) },
    enhancement: {
      'host.vanguard.banner': record('Banner', {
        detachment: 'host.vanguard',
        type: 'model',
        eligibility: { anyOf: [{ keywords: ['INFANTRY'] }] },
      }),
    },
    allegiance: { 'host.vanguard.red': record('Red', {}), 'host.vanguard.blue': record('Blue', {}) },
    unit: {
      'host.squad': record('Squad', {
        faction: 'host',
        keywords: ['INFANTRY'],
        sizes: [5, 10],
        allegiances: [{ choices: ['host.vanguard.red', 'host.vanguard.blue'], detachment: 'host.vanguard', required: true }],
      }),
      'host.captain': record('Captain', { faction: 'host', keywords: ['INFANTRY', 'CHARACTER'], sizes: [1] }),
      'host.brood': record('Brood', { faction: 'host', keywords: [], sizes: [10] }),
      'titans.walker': record('Walker', { faction: 'titans', keywords: ['TITANIC'], sizes: [1] }),
      'host.band': record('Band', { faction: 'host', keywords: [], sizes: [4], defaultModels: { 'host.band.archer': 4 } }),
    },
    model: {
      'host.squad.sergeant': record('Sergeant', { unit: 'host.squad', min: 1, max: 1, wargear: { 'host.rifle': 1 } }),
      'host.squad.trooper': record('Trooper', {
        unit: 'host.squad',
        min: 4,
        max: 9,
        bySize: [
          { size: 5, min: 4, max: 4 },
          { size: 10, min: 9, max: 9 },
        ],
        wargear: {
          'host.rifle': 1,
        },
      }),
      'host.captain.captain': record('Captain', { unit: 'host.captain', min: 1, max: 1, wargear: { 'host.rifle': 1 } }),
      'host.brood.gaunt': record('Gaunt', { unit: 'host.brood', min: 10, max: 10, wargear: { 'host.fleshborer': 1 } }),
      'titans.walker.walker': record('Walker', { unit: 'titans.walker', min: 1, max: 1, wargear: {} }),
      'host.band.archer': record('Archer', { unit: 'host.band', min: 0, max: 4, wargear: {} }),
      'host.band.spear': record('Spear', { unit: 'host.band', min: 0, max: 4, wargear: {} }),
    },
    'roster-option': {
      'host.brood.fleshborer': record('Gaunt fleshborer', {
        unit: 'host.brood',
        carrier: 'host.brood.gaunt',
        per: 'carrier',
        choose: { min: 0, max: 1 },
        uniform: true,
        substitutes: ['host.spike'],
        replaces: { 'host.fleshborer': 1 },
        choices: ['host.devourer', 'host.spike'],
        caps: [{ choices: ['host.spike'], max: 1 }],
      }),
      'host.squad.sergeant-rifle': record('Sergeant rifle', {
        unit: 'host.squad',
        carrier: 'host.squad.sergeant',
        per: 'carrier',
        choose: { min: 0, max: 1 },
        replaces: { 'host.rifle': 1 },
        choices: ['host.sword', 'host.pistol'],
      }),
      'host.squad.trooper-rifle': record('Trooper rifle', {
        unit: 'host.squad',
        carrier: 'host.squad.trooper',
        per: 'carrier',
        choose: { min: 0, max: 1 },
        replaces: { 'host.rifle': 1 },
        choices: ['host.cannon'],
        caps: [{ choices: ['host.cannon'], max: 1 }],
      }),
    },
    wargear: {
      'host.fleshborer': record('Fleshborer', {}),
      'host.devourer': record('Devourer', {}),
      'host.spike': record('Spike', {}),
      'host.rifle': record('Rifle', {}),
      'host.sword': record('Sword', {}),
      'host.pistol': record('Pistol', {}),
      'host.cannon': record('Cannon', {}),
    },
  },
})
