import { describe, expect, it } from 'vitest'
import type { RosterPick } from './roster'
import { rosterSnapshot } from './rosterSnapshot'

type Saved = Parameters<typeof rosterSnapshot>[0]
type Priced = Parameters<typeof rosterSnapshot>[1]

const saved = (over: Partial<Saved> = {}): Saved => ({
  id: 'roster',
  name: 'Army',
  catalogueId: 'catalogue',
  detachmentIds: [],
  disposition: null,
  limit: 2_000,
  waivedRules: [],
  picks: [],
  ...over,
})
const priced = (over: Partial<Priced> = {}): Priced => ({
  points: 0,
  revision: 'revision',
  label: 'Army',
  detachment: null,
  detachments: [],
  detachmentPointBudget: null,
  disposition: null,
  dispositions: [],
  units: [],
  ...over,
})
const unit = (over: Partial<Priced['units'][number]> = {}): Priced['units'][number] => ({
  key: 0,
  entryId: 'unit',
  name: 'Unit',
  points: 80,
  group: 'infantry',
  keywords: [],
  toggles: [],
  size: { models: 5, resizable: false },
  attachment: null,
  wargear: [],
  enhancements: [],
  upgrades: [],
  formationOptions: [],
  prebattleRules: [],
  ...over,
})

it('freezes the preview label when the same codex is later released', () => {
  const edition = { id: 'codex', name: 'Test codex', status: 'preview' as 'preview' | 'released' }
  const snapshot = rosterSnapshot(saved({ catalogueId: 'codex~book' }), priced({ edition }), [])
  edition.status = 'released'
  expect(snapshot.built?.edition?.status).toBe('preview')
  expect(snapshot.text).toContain('Codex: Test codex · Preview')
})

it('freezes unit wounds, reserve exemptions, and transport capability into a roster snapshot', () => {
  const roster = rosterSnapshot(
    saved({ picks: [{ entryId: 'unit' }] }),
    priced({
      points: 80,
      strategicReserveFactsComplete: true,
      units: [
        unit({
          keywords: ['Infantry'],
          formationOptions: ['battlefield'],
          strategicReserveExempt: true,
          embarksWithBodyguard: true,
          embarkedSpace: 3,
          transport: true,
        }),
      ],
    }),
    [{ entryId: 'unit', wounds: 3, transportRule: 'This model has a transport capacity of 12 models.' }],
  )

  expect(roster.built).toMatchObject({
    strategicReserveLimit: 1_000,
    units: [
      expect.objectContaining({
        wounds: 3,
        strategicReserveExempt: true,
        embarksWithBodyguard: true,
        embarkedSpace: 3,
        transport: true,
        transportRule: 'This model has a transport capacity of 12 models.',
        keywords: ['Infantry'],
      }),
    ],
  })
})

it('freezes enabled reminders into a roster snapshot', () => {
  const reminder = {
    key: 'faction:oath-of-moment:army',
    ability: 'Oath of Moment',
    description: 'At the start of your Command phase, select one enemy unit.',
    timings: [{ moment: 'phase-start' as const, phase: 'command' as const, turn: 'your-turn' as const }],
  }
  const roster = rosterSnapshot(saved({ reminders: [reminder], remindersEnabled: true }), priced(), [])

  expect(roster).toMatchObject({ reminders: [reminder], remindersEnabled: true })
})

it('maps unit alerts from roster picks to the battle units they produced', () => {
  const timing = { moment: 'phase-start' as const, phase: 'command' as const, turn: 'your-turn' as const }
  const roster = rosterSnapshot(
    saved({
      picks: [{ entryId: 'missing' }, { entryId: 'unit' }],
      reminders: [
        { key: 'missing', ability: 'Missing', description: '', unit: { index: 0, name: 'Missing' }, timings: [timing] },
        { key: 'unit', ability: 'Unit', description: '', unit: { index: 1, name: 'Unit' }, timings: [timing] },
      ],
    }),
    priced({ points: 80, units: [unit({ key: 1 })] }),
    [],
  )

  expect(roster.reminders).toMatchObject([{ key: 'unit', unit: { index: 0, name: 'Unit' } }])
})

it('freezes catalogue-derived Warlord eligibility into a roster snapshot', () => {
  const roster = rosterSnapshot(
    saved({ limit: 1_000, picks: [{ entryId: 'captain' }] }),
    priced({
      points: 80,
      units: [
        unit({
          entryId: 'captain',
          name: 'Captain',
          group: 'vehicle',
          toggles: [{ name: 'Warlord', selected: true }],
          size: { models: 1, resizable: false },
        }),
      ],
    }),
    [],
  )

  expect(roster.built?.units[0]).toMatchObject({ warlord: true, warlordEligible: true })
})

it('does not freeze a reserve limit from incomplete rules facts', () => {
  const roster = rosterSnapshot(saved(), priced({ strategicReserveFactsComplete: false }), [])

  expect(roster.built).not.toHaveProperty('strategicReserveLimit')
})

it('freezes the unit a character joined into a roster snapshot', () => {
  const roster = rosterSnapshot(
    saved({ picks: [{ entryId: 'marines' }, { entryId: 'lord', attachedTo: 0 }] }),
    priced({
      points: 160,
      units: [
        unit({ key: 0, entryId: 'marines', name: 'Plague Marines', group: 'battleline' }),
        unit({ key: 1, entryId: 'lord', name: 'Lord of Contagion', group: 'character' }),
      ],
    }),
    [],
  )

  expect(roster.built?.units[1]?.attachedTo).toBe(roster.built?.units[0]?.key)
})

it('leaves a character the list joined to nothing unattached', () => {
  const roster = rosterSnapshot(
    saved({ picks: [{ entryId: 'lord' }] }),
    priced({
      points: 80,
      units: [
        unit({
          entryId: 'lord',
          name: 'Lord of Contagion',
          group: 'character',
          size: { models: 1, resizable: false },
          formationOptions: ['deep-strike'],
        }),
      ],
    }),
    [],
  )

  expect(roster.built?.units[0]).not.toHaveProperty('attachedTo')
})

it('fields a list nobody named under the label it had when it was fielded', () => {
  const snapshot = rosterSnapshot(
    saved({ name: '', limit: 1_000, picks: [{ entryId: 'unit' }] }),
    priced({ points: 80, label: "HL 1K - C'tan & Hexmark", units: [unit()] }),
    [],
  )
  expect(snapshot.name).toBe("HL 1K - C'tan & Hexmark")
})

it('freezes a custom points budget and halves it for the strategic reserve limit', () => {
  const roster = rosterSnapshot(
    saved({ pointsBudget: 1_500 }),
    priced({ strategicReserveFactsComplete: true, detachmentPointBudget: 3 }),
    [],
  )

  expect([roster.built?.limit, roster.built?.pointsBudget, roster.built?.strategicReserveLimit, roster.text.split('\n')[0]]).toEqual([
    2_000,
    1_500,
    750,
    '0 / 1500 pts',
  ])
})

it('freezes two identical units with their own nicknames and notes, unaffected by later edits to the saved list', () => {
  const intercessors = (key: number) => unit({ key, entryId: 'intercessors', name: 'Intercessor Squad', group: 'battleline' })
  const picks = [
    { entryId: 'intercessors', nickname: 'Alpha', note: 'Hold home.' },
    { entryId: 'intercessors', nickname: 'Bravo', note: 'Push midfield.' },
  ]
  const snapshot = rosterSnapshot(
    saved({ catalogueId: 'marines', picks }),
    priced({ points: 160, units: [intercessors(0), intercessors(1)] }),
    [],
  )
  picks[0]!.nickname = 'Renamed'
  picks[1]!.note = 'Changed plan.'

  expect({
    units: snapshot.built?.units.map(({ name, nickname, note }) => ({ name, nickname, note })),
    picks: snapshot.built?.picks?.map(({ nickname, note }) => ({ nickname, note })),
  }).toEqual({
    units: [
      { name: 'Intercessor Squad', nickname: 'Alpha', note: 'Hold home.' },
      { name: 'Intercessor Squad', nickname: 'Bravo', note: 'Push midfield.' },
    ],
    picks: [
      { nickname: 'Alpha', note: 'Hold home.' },
      { nickname: 'Bravo', note: 'Push midfield.' },
    ],
  })
})

describe('starting embarks', () => {
  const snapshot = (picks: RosterPick[], built: number[]) =>
    rosterSnapshot(
      saved({ picks }),
      priced({
        points: 240,
        units: built.map((key) => unit({ key, entryId: picks[key]!.entryId, name: picks[key]!.entryId, group: 'other' })),
      }),
      [],
    )

  it('freezes the transport a unit starts in by the key the snapshot gives it', () => {
    const roster = snapshot([{ entryId: 'marines', embarkedIn: 1 }, { entryId: 'rhino' }], [0, 1])
    expect(roster.built?.units[0]?.startsEmbarkedIn).toBe(roster.built?.units[1]?.key)
  })

  it('leaves out a starting embark in a transport the catalogue could not build', () => {
    const roster = snapshot([{ entryId: 'marines', embarkedIn: 1 }, { entryId: 'gone' }], [0])
    expect(roster.built?.units[0]).not.toHaveProperty('startsEmbarkedIn')
  })

  it('leaves the starting embark of a character to the unit it joined', () => {
    const roster = snapshot([{ entryId: 'marines' }, { entryId: 'lord', attachedTo: 0, embarkedIn: 2 }, { entryId: 'rhino' }], [0, 1, 2])
    expect(roster.built?.units[1]).not.toHaveProperty('startsEmbarkedIn')
  })
})
