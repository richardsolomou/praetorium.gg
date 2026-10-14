import { expect, it } from 'vitest'
import { rosterSnapshot } from './rosterSnapshot'

it('freezes the preview label when the same codex is later released', () => {
  const edition = { id: 'codex', name: 'Test codex', status: 'preview' as 'preview' | 'released' }
  const snapshot = rosterSnapshot(
    { id: 'list', name: 'Army', catalogueId: 'codex~book', detachmentIds: [], disposition: null, limit: 2000, waivedRules: [], picks: [] },
    {
      edition,
      points: 0,
      revision: 'revision',
      label: 'Army',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [],
    },
    [],
  )
  edition.status = 'released'
  expect(snapshot.built?.edition?.status).toBe('preview')
  expect(snapshot.text).toContain('Codex: Test codex · Preview')
})

it('freezes unit wounds, reserve exemptions, and transport capability into a roster snapshot', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [{ entryId: 'unit' }],
    },
    {
      points: 80,
      revision: 'revision',
      strategicReserveFactsComplete: true,
      label: 'GTF 2K',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [
        {
          key: 0,
          entryId: 'unit',
          name: 'Unit',
          points: 80,
          group: 'infantry',
          toggles: [],
          size: { models: 5, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: ['battlefield'],
          prebattleRules: [],
          strategicReserveExempt: true,
          transport: true,
        },
      ],
    },
    [{ entryId: 'unit', wounds: 3, transportRule: 'This model has a transport capacity of 12 models.', keywords: ['Infantry'] }],
  )

  expect(roster.built).toMatchObject({
    strategicReserveLimit: 1_000,
    units: [
      expect.objectContaining({
        wounds: 3,
        strategicReserveExempt: true,
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
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [],
      reminders: [reminder],
      remindersEnabled: true,
    },
    {
      points: 0,
      revision: 'revision',
      label: 'GTF 2K',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [],
    },
    [],
  )

  expect(roster).toMatchObject({ reminders: [reminder], remindersEnabled: true })
})

it('maps unit alerts from roster picks to the battle units they produced', () => {
  const timing = { moment: 'phase-start' as const, phase: 'command' as const, turn: 'your-turn' as const }
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [{ entryId: 'missing' }, { entryId: 'unit' }],
      reminders: [
        { key: 'missing', ability: 'Missing', description: '', unit: { index: 0, name: 'Missing' }, timings: [timing] },
        { key: 'unit', ability: 'Unit', description: '', unit: { index: 1, name: 'Unit' }, timings: [timing] },
      ],
    },
    {
      points: 80,
      revision: 'revision',
      label: 'Army',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [
        {
          key: 1,
          entryId: 'unit',
          name: 'Unit',
          points: 80,
          group: 'infantry',
          toggles: [],
          size: { models: 5, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: ['battlefield'],
          prebattleRules: [],
        },
      ],
    },
    [],
  )

  expect(roster.reminders).toMatchObject([{ key: 'unit', unit: { index: 0, name: 'Unit' } }])
})

it('freezes catalogue-derived Warlord eligibility into a roster snapshot', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 1_000,
      waivedRules: [],
      picks: [{ entryId: 'captain' }],
    },
    {
      points: 80,
      revision: 'revision',
      label: 'GTF 2K',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [
        {
          key: 0,
          entryId: 'captain',
          name: 'Captain',
          points: 80,
          group: 'vehicle',
          toggles: [{ name: 'Warlord', selected: true }],
          size: { models: 1, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: ['battlefield'],
          prebattleRules: [],
        },
      ],
    },
    [],
  )

  expect(roster.built?.units[0]).toMatchObject({ warlord: true, warlordEligible: true })
})

it('does not freeze a reserve limit from incomplete rules facts', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [],
    },
    {
      points: 0,
      revision: 'revision',
      strategicReserveFactsComplete: false,
      label: 'Empty army',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [],
    },
    [],
  )

  expect(roster.built).not.toHaveProperty('strategicReserveLimit')
})

it('freezes the unit a character joined into a roster snapshot', () => {
  const unit = {
    points: 80,
    toggles: [],
    size: { models: 5, resizable: false },
    attachment: null,
    wargear: [],
    enhancements: [],
    upgrades: [],
    formationOptions: [] as const,
    prebattleRules: [] as const,
  }
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [{ entryId: 'marines' }, { entryId: 'lord', attachedTo: 0 }],
    },
    {
      points: 160,
      revision: 'revision',
      label: 'GTF 2K',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [
        { ...unit, key: 0, entryId: 'marines', name: 'Plague Marines', group: 'battleline' },
        { ...unit, key: 1, entryId: 'lord', name: 'Lord of Contagion', group: 'character' },
      ],
    },
    [],
  )

  expect(roster.built?.units[1]?.attachedTo).toBe(roster.built?.units[0]?.key)
})

it('leaves a character the list joined to nothing unattached', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      waivedRules: [],
      picks: [{ entryId: 'lord' }],
    },
    {
      points: 80,
      revision: 'revision',
      label: 'GTF 2K',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [
        {
          key: 0,
          entryId: 'lord',
          name: 'Lord of Contagion',
          points: 80,
          group: 'character',
          toggles: [],
          size: { models: 1, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: ['deep-strike'],
          prebattleRules: [],
        },
      ],
    },
    [],
  )

  expect(roster.built?.units[0]).not.toHaveProperty('attachedTo')
})

it('fields a list nobody named under the label it had when it was fielded', () => {
  const snapshot = rosterSnapshot(
    {
      id: 'roster',
      name: '',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 1_000,
      waivedRules: [],
      picks: [{ entryId: 'unit' }],
    },
    {
      points: 80,
      revision: 'revision',
      label: "HL 1K - C'tan & Hexmark",
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [
        {
          key: 0,
          entryId: 'unit',
          name: 'Unit',
          points: 80,
          group: 'infantry',
          toggles: [],
          size: { models: 5, resizable: false },
          attachment: null,
          wargear: [],
          enhancements: [],
          upgrades: [],
          formationOptions: [],
          prebattleRules: [],
        },
      ],
    },
    [],
  )
  expect(snapshot.name).toBe("HL 1K - C'tan & Hexmark")
})

it('freezes a custom points budget and halves it for the strategic reserve limit', () => {
  const roster = rosterSnapshot(
    {
      id: 'roster',
      name: 'Army',
      catalogueId: 'catalogue',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      pointsBudget: 1_500,
      waivedRules: [],
      picks: [],
    },
    {
      points: 0,
      revision: 'revision',
      strategicReserveFactsComplete: true,
      label: 'Army',
      detachment: null,
      detachments: [],
      detachmentPointBudget: 3,
      disposition: null,
      dispositions: [],
      units: [],
    },
    [],
  )

  expect([roster.built?.limit, roster.built?.pointsBudget, roster.built?.strategicReserveLimit, roster.text.split('\n')[0]]).toEqual([
    2_000,
    1_500,
    750,
    '0 / 1500 pts',
  ])
})

it('freezes two identical units with their own notes, unaffected by later edits to the saved list', () => {
  const unit = (key: number) => ({
    key,
    entryId: 'intercessors',
    name: 'Intercessor Squad',
    points: 80,
    group: 'battleline' as const,
    toggles: [],
    size: { models: 5, resizable: false },
    attachment: null,
    wargear: [],
    enhancements: [],
    upgrades: [],
    formationOptions: [],
    prebattleRules: [],
  })
  const saved = {
    id: 'list',
    name: 'Army',
    catalogueId: 'marines',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    waivedRules: [],
    picks: [
      { entryId: 'intercessors', note: 'Hold home.' },
      { entryId: 'intercessors', note: 'Push midfield.' },
    ],
  }
  const snapshot = rosterSnapshot(
    saved,
    {
      points: 160,
      revision: 'revision',
      label: 'Army',
      detachment: null,
      detachments: [],
      detachmentPointBudget: null,
      disposition: null,
      dispositions: [],
      units: [unit(0), unit(1)],
    },
    [],
  )
  saved.picks[1]!.note = 'Changed plan.'

  expect({
    units: snapshot.built?.units.map((frozen) => frozen.note),
    picks: snapshot.built?.picks?.map((pick) => pick.note),
  }).toEqual({
    units: ['Hold home.', 'Push midfield.'],
    picks: ['Hold home.', 'Push midfield.'],
  })
})
