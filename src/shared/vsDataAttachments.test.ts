import { describe, expect, it } from 'vitest'
import { vsDataDefinitions } from '../core/vsDataConstruction'
import { vsLinksIndex } from './vsDataAttachments'

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
