import { describe, expect, it } from 'vitest'
import type { RosterPick } from '../../../../core/roster'
import { rosterEmbarks } from './embarkModel'

const unit = (key: number, entryId: string, models: number, transport = false) => ({
  key,
  entryId,
  name: entryId,
  points: 80,
  group: transport ? ('transport' as const) : ('battleline' as const),
  toggles: [],
  size: { models, resizable: false },
  attachment: null,
  wargear: [],
  enhancements: [],
  upgrades: [],
  formationOptions: [],
  prebattleRules: [],
  ...(transport ? { transport: true } : {}),
})

const units = [unit(0, 'Intercessors', 5), unit(1, 'Captain', 1), unit(2, 'Scouts', 5), unit(3, 'Rhino', 1, true)]
const details = [
  { entryId: 'Intercessors', keywords: ['Infantry'] },
  { entryId: 'Captain', keywords: ['Infantry', 'Character'] },
  { entryId: 'Scouts', keywords: ['Infantry'] },
  { entryId: 'Rhino', keywords: ['Vehicle', 'Transport'], transportRule: 'This model has a transport capacity of 10 INFANTRY models.' },
]
const picks = (embarks: RosterPick[] = [{}, {}, {}, {}].map(() => ({ entryId: '' }))): RosterPick[] =>
  units.map((entry, at) => ({ ...embarks[at], entryId: entry.entryId }))

describe('roster embarks', () => {
  it('offers the roster’s transports to an infantry unit', () => {
    expect(rosterEmbarks(picks(), units, details).transportsFor(0)).toEqual([
      { pickIndex: 3, name: 'Rhino', aboard: '0/10 models', refusal: null, chosen: false },
    ])
  })

  it('offers no transport to a transport', () => {
    expect(rosterEmbarks(picks(), units, details).transportsFor(3)).toEqual([])
  })

  it('counts the units already starting aboard', () => {
    const embarked = picks([
      { entryId: '', embarkedIn: 3 },
      { entryId: '', attachedTo: 0 },
    ])
    expect(rosterEmbarks(embarked, units, details).transportsFor(2)[0]).toMatchObject({
      aboard: '6/10 models',
      refusal: 'this transport can carry at most 10 models',
    })
  })

  it('marks the transport a unit starts in', () => {
    expect(rosterEmbarks(picks([{ entryId: '', embarkedIn: 3 }]), units, details).transportsFor(0)[0]?.chosen).toBe(true)
  })

  it('keeps a character’s choice on the unit it joined', () => {
    expect(rosterEmbarks(picks([{ entryId: '' }, { entryId: '', attachedTo: 0 }]), units, details).hostOf(1)).toBe(0)
  })

  it('reports the starting embarks the list can no longer hold', () => {
    const crowded = picks([
      { entryId: '', embarkedIn: 3 },
      { entryId: '', attachedTo: 0 },
      { entryId: '', embarkedIn: 3 },
    ])
    expect(rosterEmbarks(crowded, units, details).dropped).toEqual([2])
  })

  it('refuses a transport whose capacity cannot be read', () => {
    const unread = details.map((entry) => (entry.entryId === 'Rhino' ? { ...entry, transportRule: 'Carries some models.' } : entry))
    expect(rosterEmbarks(picks(), units, unread).transportsFor(0)[0]).toMatchObject({
      aboard: null,
      refusal: 'this transport has no known model capacity',
    })
  })
})
