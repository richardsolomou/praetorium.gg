import { describe, expect, it } from 'vitest'
import {
  vsDataChecks,
  vsDataDetachmentsOffering,
  vsDataUnheld,
  vsRosterData,
  vsDataErrors,
  vsDataWithoutDetachments,
  vsPickErrors,
  type CheckedUnit,
} from './vsDataLegality'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const data = vsRosterData(
  {
    release: 'test',
    rulesVersion: { edition: '11th', update: 'test' },
    unavailable: [],
    points: [],
    definitions: {
      faction: {
        host: record('Host', {
          unitLimits: [{ keywords: ['WARDEN’S CHOSEN'], max: 1 }],
          allies: [
            { units: ['other.scout'], points: [{ battleSize: 'small', max: 100 }] },
            { units: ['other.warden', 'host.seer'], detachments: ['host.vigil'] },
          ],
        }),
        other: record('Other', {}),
        titan: record('Titan', {}),
        engines: record('Engines', { withoutDetachments: { warlords: [], dispositions: ['pack.take-and-hold'] } }),
        relics: record('Relics', { withoutDetachments: { warlords: [], dispositions: [] } }),
      },
      'battle-size': { small: record('Small', { points: 1000, enhancements: 1 }) },
      detachment: {
        'host.guard': record('Guard', { faction: 'host', group: 'SHIELD HOST' }),
        'host.vigil': record('Vigil', { faction: 'host' }),
        'host.watch': record('Watch', { faction: 'host', group: 'SHIELD HOST' }),
        'other.raid': record('Raid', { faction: 'other' }),
      },
      allegiance: { 'host.mark.fire': record('Fire', {}) },
      unit: {
        'host.mob': record('Mob', { faction: 'host', keywords: ['INFANTRY'], sizes: [10, 20] }),
        'host.lord': record('Lord', {
          faction: 'host',
          keywords: ['CHARACTER', 'INFANTRY'],
          sizes: [1],
          allegiances: [{ choices: ['host.mark.fire'], required: true }],
        }),
        'engines.walker': record('Walker', { faction: 'engines', keywords: ['TITANIC'], sizes: [1] }),
        'other.fort': record('Fort', { faction: 'other', keywords: ['FORTIFICATION'], sizes: [1], legends: true }),
        'titan.walker': record('Walker', { faction: 'titan', keywords: ['TITANIC'], sizes: [1] }),
        'host.squad': record('Squad', {
          faction: 'host',
          keywords: ['INFANTRY'],
          sizes: [5, 10],
          uniformOptions: [['host.squad.trooper-carbines', 'host.squad.sergeant-carbine']],
        }),
        'other.agent': record('Agent', { faction: 'other', keywords: ['INFANTRY'], sizes: [1] }),
        'other.warden': record('Warden', { faction: 'other', keywords: ['INFANTRY'], sizes: [1] }),
        'host.seer': record('Seer', { faction: 'host', keywords: ['INFANTRY'], sizes: [1] }),
        'host.chosen': record("Warden's Chosen", { faction: 'host', keywords: ['CHARACTER', "WARDEN'S CHOSEN"], sizes: [1] }),
        'other.scout': record('Scout', { faction: 'other', keywords: ['INFANTRY'], sizes: [1] }),
      },
      'roster-option': {
        'host.squad.guns': record('Trooper guns', {
          unit: 'host.squad',
          carrier: 'host.squad.trooper',
          per: 'carrier',
          choose: { min: 0, max: 1 },
          choices: ['host.squad.plasma', 'host.squad.melta'],
          caps: [{ choices: ['host.squad.plasma'], max: 1 }],
        }),
        'host.squad.rokkits': record('Rokkits', {
          unit: 'host.squad',
          carrier: 'host.squad.trooper',
          per: 'carrier',
          choose: { min: 0, max: 1 },
          choices: ['host.squad.pulsa', 'host.squad.melta'],
          caps: [{ choices: ['host.squad.pulsa', 'host.squad.melta'], max: 1 }],
        }),
        'host.squad.trooper-carbines': record('Trooper carbines', {
          unit: 'host.squad',
          carrier: 'host.squad.trooper',
          per: 'carrier',
          uniform: true,
          choose: { min: 0, max: 1 },
          choices: ['host.squad.ember', 'host.squad.ash'],
        }),
        'host.squad.sergeant-carbine': record('Sergeant carbine', {
          unit: 'host.squad',
          carrier: 'host.squad.sergeant',
          per: 'carrier',
          uniform: true,
          choose: { min: 0, max: 1 },
          choices: ['host.squad.ember', 'host.squad.ash'],
        }),
        'host.squad.scope': record('Scope', {
          unit: 'host.squad',
          choose: { min: 0, max: 1 },
          choices: ['host.squad.sight'],
          requires: { option: 'host.squad.guns', choices: ['host.squad.plasma'] },
        }),
      },
      wargear: {
        'host.squad.plasma': record('Plasma gun', {}),
        'host.squad.melta': record('Meltagun', {}),
        'host.squad.sight': record('Sight', {}),
        'host.squad.ember': record('Ember carbine', {}),
        'host.squad.ash': record('Ash carbine', {}),
        'host.squad.pulsa': record('Pulsa Rokkit (Once per battle, per unit)', {}),
      },
      model: {
        'host.mob.grunt': record('Grunt', { unit: 'host.mob', min: 10, max: 20, wargear: {} }),
        'host.lord.lord': record('Lord', { unit: 'host.lord', min: 1, max: 1, wargear: {} }),
        'host.squad.sergeant': record('Sergeant', { unit: 'host.squad', min: 1, max: 1, wargear: {} }),
        'host.squad.trooper': record('Trooper', { unit: 'host.squad', min: 4, max: 9, wargear: {} }),
      },
      enhancement: {
        'host.guard.crown': record('Crown', {
          detachment: 'host.guard',
          type: 'model',
          eligibility: { anyOf: [{ keywords: ['CHARACTER'] }] },
        }),
      },
    },
  },
  {
    books: { 'bs-host': 'host', 'bs-titan': 'titan', 'bs-engines': 'engines', 'bs-relics': 'relics' },
    detachments: { 'bs-guard': 'host.guard', 'bs-vigil': 'host.vigil', 'bs-watch': 'host.watch', 'bs-raid': 'other.raid' },
    units: {
      'bs-mob': 'host.mob',
      'bs-lord': 'host.lord',
      'bs-fort': 'other.fort',
      'bs-titan/bs-mob': 'titan.walker',
      'bs-walker': 'engines.walker',
      'bs-squad': 'host.squad',
      'bs-agent': 'other.agent',
      'bs-scout': 'other.scout',
      'bs-warden': 'other.warden',
      'bs-seer': 'host.seer',
      'bs-chosen': 'host.chosen',
    },
    enhancements: {
      'host.guard/bs-crown': 'host.guard.crown',
      'host.guard/bs-fire': 'host.guard.crown',
      'host.guard/bs-gone': 'host.guard.gone',
    },
  },
  null,
  (id) =>
    ({
      'bs-mob': 'Mob',
      'bs-lord': 'Lord',
      'bs-fort': 'Fort [Legends]',
      'bs-walker': 'Walker',
      'bs-squad': 'Squad',
      'bs-agent': 'Agent [Crucible]',
      'bs-scout': 'Scout',
      'bs-warden': 'Warden',
      'bs-seer': 'Seer',
      'bs-chosen': "Warden's Chosen",
    })[id],
)
const unit = (over: Partial<CheckedUnit> & Pick<CheckedUnit, 'entryId'>): CheckedUnit => ({
  key: 0,
  name: over.entryId,
  size: { models: 1, min: 1, max: 1 },
  toggles: [],
  choices: [],
  ...over,
})
const option = (id: string, name: string) => ({ name: 'Choice', options: [{ id, name, count: 1 }] as never })
const errors = (units: CheckedUnit[], detachmentIds = ['bs-guard']) =>
  vsDataErrors(data, { catalogueId: 'bs-host', detachmentIds, limit: 1000 }, units)

describe('vsDataErrors', () => {
  it('refuses a size the player chose that VS Data does not field', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 15, min: 10, max: 20 } })])).toEqual([
      { entryId: 'bs-mob', entryName: 'bs-mob', message: 'fields 10 or 20 models, has 15' },
    ])
  })

  it('reads an option VS Data offers as an allegiance as that allegiance, not an Enhancement', () => {
    expect(errors([unit({ entryId: 'bs-lord', choices: [option('bs-fire', 'Mark of Fire')] })])).toEqual([])
  })

  it('asks for an allegiance the builder offers', () => {
    expect(
      errors([
        unit({ entryId: 'bs-lord', choices: [{ name: 'Mark', options: [{ id: 'bs-fire', name: 'Mark of Fire', count: 0 }] as never }] }),
      ]),
    ).toEqual([{ entryId: 'bs-lord', entryName: 'bs-lord', message: 'needs an allegiance' }])
  })

  it('does not ask for an allegiance the builder cannot offer', () => {
    expect(errors([unit({ entryId: 'bs-lord' })])).toEqual([])
  })

  it('refuses a list with no Detachment', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 10, min: 10, max: 20 } })], [])).toEqual([
      { entryId: 'army', entryName: 'Army', message: 'needs one to three Detachments' },
    ])
  })

  it('refuses allies costing more than their points limit, at what each costs the list', () => {
    expect(errors([unit({ entryId: 'bs-scout', points: 60 }), unit({ entryId: 'bs-scout', points: 60 })])).toContainEqual({
      entryId: 'army',
      entryName: 'Army',
      message: 'allied Other units cost at most 100 points, cost 120',
    })
  })

  it('names the group two Detachments share', () => {
    expect(errors([], ['bs-guard', 'bs-watch'])).toContainEqual({
      entryId: 'army',
      entryName: 'Army',
      message: 'Watch cannot be taken with Guard, as both are SHIELD HOST',
    })
  })

  it('refuses a Detachment to a faction that takes none', () => {
    expect(vsDataErrors(data, { catalogueId: 'bs-engines', detachmentIds: ['bs-raid'], limit: 1000 }, [])).toContainEqual({
      entryId: 'army',
      entryName: 'Army',
      message: 'takes no Detachment',
    })
  })

  it('refuses a borrowed Detachment to a faction that takes none', () => {
    expect(
      vsDataErrors(data, { catalogueId: 'bs-engines', detachmentIds: [], borrowedDetachmentId: 'bs-raid', limit: 1000 }, []),
    ).toContainEqual({ entryId: 'army', entryName: 'Army', message: 'takes no Detachment' })
  })

  it('leaves a list to the catalogue when none of its book’s datasheets reads as its faction’s', () => {
    expect(vsDataErrors(data, { catalogueId: 'bs-relics', detachmentIds: ['bs-raid'], limit: 1000 }, [])).toBeNull()
  })

  it('leaves a list of a faction VS Data gives no Detachments to the catalogue', () => {
    expect(vsDataErrors(data, { catalogueId: 'bs-titan', detachmentIds: [], limit: 1000 }, [])).toBeNull()
  })

  it('leaves a Legends datasheet VS Data files under a faction the army does not ally with to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-fort' })])).toEqual([])
  })

  it('leaves a Crucible datasheet VS Data files under a faction the army does not ally with to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-agent', name: 'Agent [Crucible]' })])).toEqual([])
  })

  it('leaves a Titan VS Data files under a faction the army does not ally with to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-walker' })])).toEqual([])
  })

  it('refuses a datasheet of a faction the army does not ally with', () => {
    expect(errors([unit({ entryId: 'bs-agent', name: 'Agent' })])).toEqual([
      { entryId: 'bs-agent', entryName: 'Agent', message: 'cannot be taken by this army' },
    ])
  })

  it('leaves a list with another faction’s Detachment to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 15, min: 10, max: 20 } })], ['bs-raid'])).toBeNull()
  })

  describe('a unit fielded by VS Data IDs', () => {
    const squad = (vs: Partial<NonNullable<CheckedUnit['vs']>>) =>
      unit({
        entryId: 'bs-squad',
        name: 'Squad',
        vs: { unit: 'host.squad', models: { 'host.squad.sergeant': 1, 'host.squad.trooper': 4 }, options: {}, ...vs },
      })

    it('is checked on its own model counts', () => {
      expect(errors([squad({ models: { 'host.squad.sergeant': 1, 'host.squad.trooper': 10 } })])).toContainEqual({
        entryId: 'bs-squad',
        entryName: 'Squad',
        message: 'fields at most 9 Trooper models, has 10',
      })
    })

    it('is checked on a cap its wargear breaks', () => {
      expect(errors([squad({ options: { 'host.squad.guns': { 'host.squad.plasma': 2 } } })])).toEqual([
        { entryId: 'bs-squad', entryName: 'Squad', message: 'takes at most 1 Plasma gun, has 2' },
      ])
    })

    it('names each capped wargear whole, commas and all', () => {
      expect(errors([squad({ options: { 'host.squad.rokkits': { 'host.squad.pulsa': 1, 'host.squad.melta': 1 } } })])).toEqual([
        { entryId: 'bs-squad', entryName: 'Squad', message: 'takes at most 1 Pulsa Rokkit (Once per battle, per unit) or Meltagun, has 2' },
      ])
    })

    it('takes one choice across options its datasheet ties together', () => {
      const options = { 'host.squad.trooper-carbines': { 'host.squad.ember': 4 }, 'host.squad.sergeant-carbine': { 'host.squad.ash': 1 } }
      expect(errors([squad({ options })])).toEqual([
        { entryId: 'bs-squad', entryName: 'Squad', message: 'takes the same choice for Trooper carbines and Sergeant carbine, or none' },
      ])
    })

    it('lets tied options take the same choice', () => {
      const options = { 'host.squad.trooper-carbines': { 'host.squad.ember': 4 }, 'host.squad.sergeant-carbine': { 'host.squad.ember': 1 } }
      expect(errors([squad({ options })])).toEqual([])
    })

    it('is told which wargear an option needs', () => {
      expect(errors([squad({ options: { 'host.squad.scope': { 'host.squad.sight': 1 } } })])).toEqual([
        { entryId: 'bs-squad', entryName: 'Squad', message: 'needs Plasma gun to take Scope' },
      ])
    })

    it('is told to reselect a choice its datasheet no longer offers', () => {
      expect(errors([squad({ options: { 'host.squad.gone': { 'host.squad.plasma': 1 } } })])).toEqual([
        { entryId: 'bs-squad', entryName: 'Squad', message: 'a saved choice is no longer available; reselect this unit’s options' },
      ])
    })

    it('takes the Enhancement it names, whatever its catalogue choices say', () => {
      expect(
        errors([
          unit({
            entryId: 'bs-mob',
            vs: { unit: 'host.mob', models: { 'host.mob.grunt': 10 }, options: {}, enhancement: 'host.guard.crown' },
          }),
        ]),
      ).toEqual([{ entryId: 'bs-mob', entryName: 'bs-mob', message: 'cannot take Crown' }])
    })

    it('leaves an Enhancement VS Data does not define on a unit it reads by size to the catalogue', () => {
      expect(errors([unit({ entryId: 'bs-lord', choices: [option('bs-gone', 'Gone')] })])).toEqual([])
    })

    it('is checked on its Enhancement in a list VS Data cannot place', () => {
      const lord = unit({ entryId: 'bs-lord', vs: { unit: 'host.lord', models: {}, options: {}, enhancement: 'host.guard.crown' } })
      expect(vsPickErrors(data, { catalogueId: 'bs-titan', detachmentIds: [], limit: 1000 }, [lord])).toContainEqual({
        entryId: 'bs-lord',
        entryName: 'bs-lord',
        message: 'Crown belongs to another detachment',
      })
    })

    it('is checked on its wargear in a list VS Data cannot place', () => {
      expect(
        vsPickErrors(data, { catalogueId: 'bs-titan', detachmentIds: [], limit: 1000 }, [
          squad({ options: { 'host.squad.guns': { 'host.squad.plasma': 2 } } }),
        ]),
      ).toEqual([{ entryId: 'bs-squad', entryName: 'Squad', message: 'takes at most 1 Plasma gun, has 2' }])
    })
  })
})

describe('vsDataChecks', () => {
  it('checks a datasheet as the unit its list’s book reads it as', () => {
    expect([
      vsDataChecks(data, 'bs-titan', { entryId: 'bs-mob', name: 'Mob' }),
      vsDataChecks(data, 'bs-host', { entryId: 'bs-mob', name: 'Mob' }),
    ]).toEqual(['titan.walker', 'host.mob'])
  })
})

describe('vsDataWithoutDetachments', () => {
  it('names the force dispositions of a faction that takes no Detachment', () => {
    expect(vsDataWithoutDetachments(data, 'bs-engines')).toEqual(['take-and-hold'])
  })
})

describe('vsDataDetachmentsOffering', () => {
  const offering = (entryId: string, detachmentIds: string[]) =>
    vsDataDetachmentsOffering(data, { catalogueId: 'bs-host', detachmentIds }, { entryId, name: entryId })

  it('names the Detachment whose ally entry offers an ally the list’s own do not', () => {
    expect(offering('bs-warden', ['bs-guard'])).toEqual(['host.vigil'])
  })

  it('names it for a unit of the army’s own faction that an ally entry binds', () => {
    expect(offering('bs-seer', ['bs-guard'])).toEqual(['host.vigil'])
  })

  it('is null once the list takes that Detachment', () => {
    expect(offering('bs-warden', ['bs-vigil'])).toBeNull()
  })
})

describe('vsDataUnheld', () => {
  it('leaves a unit its faction limits by name unheld where the unit spells the keyword with another apostrophe', () => {
    const chosen = unit({ entryId: 'bs-chosen' })
    expect(vsDataUnheld(data, { catalogueId: 'bs-host', detachmentIds: ['bs-guard'] }, [chosen])).toEqual(new Set([chosen.key]))
  })
})
