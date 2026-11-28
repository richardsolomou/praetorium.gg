import { describe, expect, it } from 'vitest'
import { vsDataDefinitions } from '../core/vsDataConstruction'
import { vsLinksIndex } from './vsDataAttachments'
import { vsRosterAttachments, vsRosterData } from './vsDataLegality'

const record = (name: string, data: Record<string, unknown>) => ({ name, data })
const unit = (name: string) => record(name, { faction: 'test', keywords: [], sizes: [1] })

const links = vsLinksIndex(
  vsDataDefinitions({
    release: 'test',
    rulesVersion: { edition: '11th', update: 'MFM 1.6' },
    unavailable: [],
    points: [],
    definitions: {
      unit: {
        'test.lord': unit('Lord'),
        'test.chosen': unit('Chosen'),
        'test.raiders': unit('Raiders'),
        'test.rhino': unit('Rhino'),
        'test.sorcerer': unit('Sorcerer'),
        'test.judiciar': unit('Judiciar'),
      },
      attachment: {
        'test.lord': record('Lord', {
          unit: 'test.lord',
          leads: ['test.chosen', 'test.raiders'],
          conditional: [{ role: 'leads', units: ['test.chosen'], when: { detachment: 'test.zealots' }, shared: 'KHORNE' }],
        }),
        'test.sorcerer': record('Sorcerer', {
          unit: 'test.sorcerer',
          conditional: [{ role: 'leads', units: ['test.chosen'], when: { faction: 'test' } }],
        }),
        'test.judiciar': record('Judiciar', { unit: 'test.judiciar', leads: ['test.chosen'], supports: ['test.raiders'] }),
      },
      'transport-profile': {
        'test.rhino': record('Rhino', {
          unit: 'test.rhino',
          capacity: { loads: [[{ limit: 12, count: 'models', selectors: ['INFANTRY'] }]] },
        }),
      },
    },
  }),
  {
    units: {
      lord: 'test.lord',
      chosen: 'test.chosen',
      'chosen-link': 'test.chosen',
      rhino: 'test.rhino',
      sorcerer: 'test.sorcerer',
      judiciar: 'test.judiciar',
    },
    detachments: { zealots: 'test.zealots' },
  },
  null,
  (entryId) => ({ chosen: 'Chosen Squad', 'chosen-link': 'Chosen', lord: 'Lord', rhino: 'Rhino' })[entryId],
)

describe('VS Data attachments joined to the catalogue', () => {
  it('names a host as each catalogue datasheet of its unit is named, leaving out one none stands for', () => {
    expect(links.attachments.lord?.targets).toEqual(['Chosen Squad', 'Chosen'])
  })

  it("reads a condition's Detachment as the catalogue's", () => {
    expect(links.attachments.lord?.conditional?.[0]?.requires).toEqual([['zealots']])
  })

  it('leaves the catalogue a host only a condition no list can meet names', () => {
    expect(links.attachments.sorcerer).toBeUndefined()
  })

  it('leaves the catalogue a record that both leads and supports', () => {
    expect(links.attachments.judiciar).toBeUndefined()
  })

  it('reads a transport capacity as a printed rule is read', () => {
    expect(links.transports.rhino?.main).toEqual({ capacity: 12, carries: 'INFANTRY' })
  })
})

describe("VS Data's attachment rules joined to the catalogue", () => {
  const keyed = (name: string, keywords: string[]) => record(name, { faction: 'test', keywords, sizes: [1] })
  const rules = vsLinksIndex(
    vsDataDefinitions({
      release: 'test',
      rulesVersion: { edition: '11th', update: 'MFM 1.6' },
      unavailable: [],
      points: [],
      definitions: {
        unit: {
          'test.captain': keyed('Captain', ['CHARACTER']),
          'test.ancient': keyed('Ancient', ['INFANTRY']),
          'test.intercessors': keyed('Intercessors', []),
          'test.crusaders': keyed('Crusaders', []),
          'test.servitors': keyed('Servitors', []),
          'test.shocks': keyed('Shock Troops', []),
          'test.veterans': keyed('Veterans', []),
          'test.escort': keyed('Escort', []),
          'test.inquisitor': keyed('Inquisitor', ['CHARACTER']),
          'test.rangers': keyed('Rangers', ['BATTLELINE']),
          'test.hastarii': keyed('Hastarii', []),
        },
        attachment: {
          'test.captain': record('Captain', { unit: 'test.captain', leads: ['test.intercessors'] }),
          'test.ancient': record('Ancient', { unit: 'test.ancient', leads: ['test.intercessors'] }),
          'test.crusaders': record('Crusaders', {
            unit: 'test.crusaders',
            insteadOf: [{ units: ['test.intercessors'], role: 'leads', keywords: ['CHARACTER'] }],
          }),
          'test.servitors': record('Servitors', { unit: 'test.servitors', joins: [{ ledBy: ['TECHMARINE'], exclusive: ['SERVITORS'] }] }),
          'test.veterans': record('Veterans', {
            unit: 'test.veterans',
            insteadOf: [{ units: ['test.crusaders'], role: 'leads', keywords: ['CHARACTER'] }],
          }),
          'test.escort': record('Escort', { unit: 'test.escort', insteadOf: [{ units: ['test.intercessors'], role: 'supports' }] }),
          'test.inquisitor': record('Inquisitor', {
            unit: 'test.inquisitor',
            conditional: [{ role: 'leads', keywords: ['BATTLELINE'] }],
          }),
          'test.hastarii': record('Hastarii', {
            unit: 'test.hastarii',
            insteadOf: [{ units: ['test.rangers'], role: 'leads', keywords: ['CHARACTER'] }],
          }),
          'test.shocks': record('Shock Troops', {
            unit: 'test.shocks',
            capacity: { leads: 2, limits: [{ keywords: ['COMMAND SQUAD'], max: 1 }] },
          }),
        },
      },
    }),
    {
      units: {
        captain: 'test.captain',
        ancient: 'test.ancient',
        intercessors: 'test.intercessors',
        crusaders: 'test.crusaders',
        servitors: 'test.servitors',
        shocks: 'test.shocks',
        veterans: 'test.veterans',
        escort: 'test.escort',
        inquisitor: 'test.inquisitor',
        rangers: 'test.rangers',
        hastarii: 'test.hastarii',
      },
      detachments: {},
    },
    null,
    (entryId) =>
      ({
        captain: 'Captain',
        ancient: 'Ancient',
        intercessors: 'Intercessors',
        crusaders: 'Crusaders',
        servitors: 'Servitors',
        shocks: 'Shock Troops',
        veterans: 'Veterans',
        escort: 'Escort',
        inquisitor: 'Inquisitor',
        rangers: 'Rangers',
        hastarii: 'Hastarii',
      })[entryId],
  )

  it('lets a unit join a bodyguard that stands in for one of its hosts', () => {
    expect(rules.attachments.captain?.targets).toContain('Crusaders')
  })

  it('keeps a stand-in from a unit without the keyword it asks for', () => {
    expect(rules.attachments.ancient?.targets).toEqual(['Intercessors'])
  })

  it('reads a join of any unit a leader of its leads', () => {
    expect(rules.attachments.servitors?.joins).toEqual([{ anyHost: true, ledBy: ['TECHMARINE'], exclusive: ['SERVITORS'] }])
  })

  it('follows a stand-in for a stand-in', () => {
    expect(rules.attachments.captain?.targets).toContain('Veterans')
  })

  it('keeps a stand-in for another role from a leader', () => {
    expect(rules.attachments.captain?.targets).not.toContain('Escort')
  })

  it('lets a unit join a stand-in for a host it takes by keyword', () => {
    expect(rules.attachments.inquisitor?.conditional?.[0]?.targets).toEqual(['Hastarii'])
  })
})

describe("an earlier rules version's attachments", () => {
  const names: Record<string, string> = { captain: 'Captain', intercessors: 'Intercessor Squad' }
  const roster = vsRosterData(
    {
      release: 'test',
      rulesVersion: { edition: '11th', update: 'MFM 1.4' },
      unavailable: [],
      points: [],
      definitions: {
        faction: { test: { name: 'Test', data: { formatVersion: 2 } } },
        unit: { 'test.captain': unit('Captain'), 'test.intercessors': unit('Intercessor Squad') },
        attachment: { 'test.captain': record('Captain', { unit: 'test.captain', leads: ['test.intercessors'] }) },
      },
    },
    { books: {}, detachments: {}, units: { 'old~captain': 'test.captain', 'old~intercessors': 'test.intercessors' }, enhancements: {} },
    'old',
    (id) => names[id],
  )

  it('reads them from the roster definitions it was built from', () => {
    expect(vsRosterAttachments(roster, (id) => names[id]).captain?.targets).toEqual(['Intercessor Squad'])
  })
})
