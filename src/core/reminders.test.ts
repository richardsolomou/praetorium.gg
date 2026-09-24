import { describe, expect, it } from 'vitest'
import {
  reminderTimingCountsByUnit,
  reminderDue,
  reminderKey,
  remindersAfterUnitInserted,
  remindersAfterUnitRemoved,
  remindersDueAt,
  reminderTimingLabel,
  suggestReminderTimings,
} from './reminders'

it('counts every configured alert timing on a unit', () => {
  expect(
    reminderTimingCountsByUnit([
      {
        key: 'datasheet:single:0',
        ability: 'Single',
        description: '',
        unit: { index: 0, name: 'Overlord' },
        timings: [{ moment: 'phase-start', phase: 'command', turn: 'your-turn' }],
      },
      {
        key: 'datasheet:living-lightning:2',
        ability: 'Living Lightning',
        description: '',
        unit: { index: 2, name: 'Plasmancer' },
        timings: [
          { moment: 'phase-start', phase: 'shooting', turn: 'your-turn' },
          { moment: 'phase-start', phase: 'fight', turn: 'either' },
        ],
      },
    ]),
  ).toEqual(
    new Map([
      [0, 1],
      [2, 2],
    ]),
  )
})

describe('suggestReminderTimings', () => {
  it('reads the start of your command phase', () => {
    expect(suggestReminderTimings('At the start of your Command phase, select one enemy unit.')).toEqual([
      { moment: 'phase-start', phase: 'command', turn: 'your-turn' },
    ])
  })

  it('suggests the start for an ability used during your shooting phase', () => {
    expect(suggestReminderTimings('In your Shooting phase, select one enemy unit within 18".')).toEqual([
      { moment: 'phase-start', phase: 'shooting', turn: 'your-turn' },
    ])
  })

  it('reads the end of your opponents turn', () => {
    expect(suggestReminderTimings('At the end of your opponent’s turn, place this unit into Strategic Reserves.')).toEqual([
      { moment: 'turn-end', phase: null, turn: 'opponent-turn' },
    ])
  })

  it('uses an activation before its expiry', () => {
    expect(
      suggestReminderTimings(
        'At the end of your Movement phase, select one enemy unit. Until the start of your next Command phase, mark it.',
      ),
    ).toEqual([{ moment: 'phase-end', phase: 'movement', turn: 'your-turn' }])
  })

  it('does not invent timing for event-driven prose', () => {
    expect(suggestReminderTimings('Each time a model in this unit makes an attack, re-roll the Hit roll.')).toEqual([])
  })

  it('keeps an independent turn scope for every named phase', () => {
    expect(suggestReminderTimings('In your Shooting phase or the Fight phase, select one enemy unit.')).toEqual([
      { moment: 'phase-start', phase: 'shooting', turn: 'your-turn' },
      { moment: 'phase-start', phase: 'fight', turn: 'either' },
    ])
  })

  it("treats each player's phase as either turn", () => {
    expect(suggestReminderTimings("At the start of each player's Command phase, select one objective marker.")).toEqual([
      { moment: 'phase-start', phase: 'command', turn: 'either' },
    ])
  })
})

describe('reminderDue', () => {
  it('matches a phase on the configured side of the table', () => {
    expect(
      reminderDue(
        { moment: 'phase-start', phase: 'shooting', turn: 'opponent-turn' },
        { moment: 'phase-start', phase: 'shooting', turn: 'opponent-turn' },
      ),
    ).toBe(true)
  })

  it('does not match the same phase on your turn', () => {
    expect(
      reminderDue(
        { moment: 'phase-start', phase: 'shooting', turn: 'opponent-turn' },
        { moment: 'phase-start', phase: 'shooting', turn: 'your-turn' },
      ),
    ).toBe(false)
  })

  it('matches either turn', () => {
    expect(
      reminderDue({ moment: 'turn-end', phase: null, turn: 'either' }, { moment: 'turn-end', phase: null, turn: 'opponent-turn' }),
    ).toBe(true)
  })

  it('fires one reminder at each independently configured phase', () => {
    const reminder = {
      key: 'multi-phase',
      ability: 'Two windows',
      description: '',
      timings: [
        { moment: 'phase-start' as const, phase: 'shooting' as const, turn: 'your-turn' as const },
        { moment: 'phase-start' as const, phase: 'fight' as const, turn: 'either' as const },
      ],
    }

    expect(remindersDueAt([reminder], [{ moment: 'phase-start', phase: 'fight', turn: 'opponent-turn' }]).map(({ key }) => key)).toEqual([
      'multi-phase',
    ])
  })
})

it('keys faction abilities once for the army and datasheet abilities by unit', () => {
  expect(reminderKey({ id: 'faction-copy', kind: 'faction', name: 'Oath of Moment' }, 4)).toBe('faction:oath-of-moment:army')
  expect(reminderKey({ id: 'living-lightning-id', kind: 'datasheet', name: 'Living Lightning' }, 4)).toBe('datasheet:living-lightning-id:4')
})

it('describes configured timing in player-facing words', () => {
  expect(reminderTimingLabel({ moment: 'turn-end', phase: null, turn: 'opponent-turn' })).toBe("End of opponent's turn")
  expect(reminderTimingLabel({ moment: 'phase-start', phase: 'command', turn: 'your-turn' })).toBe('Start of your Command phase')
})

it('removes a deleted units reminders and rekeys the units after it', () => {
  const reminder = (ability: string, index?: number) => ({
    key: index === undefined ? `faction:${ability}:army` : `datasheet:${ability}:${index}`,
    ability,
    description: '',
    ...(index === undefined ? {} : { unit: { index, name: `Unit ${index}` } }),
    timings: [{ moment: 'turn-start' as const, phase: null, turn: 'your-turn' as const }],
  })

  expect(remindersAfterUnitRemoved([reminder('army'), reminder('deleted', 1), reminder('kept', 2)], 1)).toEqual([
    reminder('army'),
    { ...reminder('kept', 1), unit: { index: 1, name: 'Unit 2' } },
  ])
})

it('rekeys reminders when a preceding unit is inserted', () => {
  const reminder = {
    key: 'upgrade:dimensional-overseer:1',
    ability: 'Dimensional Overseer',
    description: '',
    unit: { index: 1, name: 'Hexmark Destroyer' },
    timings: [{ moment: 'turn-start' as const, phase: null, turn: 'your-turn' as const }],
  }

  expect(remindersAfterUnitInserted([reminder], 1)).toEqual([
    { ...reminder, key: 'upgrade:dimensional-overseer:2', unit: { ...reminder.unit, index: 2 } },
  ])
})
