import { describe, expect, it } from 'vitest'
import {
  ABILITY_REMINDERS_MAX,
  abilityReminderFits,
  abilityRemindersFromRosters,
  chosenReminderAbilities,
  fieldedReminders,
  reminderTimingCountsByUnit,
  reminderDue,
  detachmentRuleSubject,
  reminderKey,
  remindersForDetachments,
  remindersDueAt,
  ROSTER_REMINDERS_MAX,
  withAbilityReminder,
  reminderTimingLabel,
  reminderTimingSchema,
  roundReminderMoment,
  suggestReminderTimings,
  suggestReminderWhileDestroyed,
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
  it('suggests both Battle Focus round boundaries', () => {
    expect(
      suggestReminderTimings(
        'If your Army Faction is Asuryani, at the start of the battle round, you receive Battle Focus tokens. At the end of the battle round, all unspent tokens are lost.',
      ),
    ).toEqual([
      { moment: 'round-start', phase: null, turn: 'either' },
      { moment: 'round-end', phase: null, turn: 'either' },
    ])
  })

  it.each(['each', 'every', 'a'])('reads the start of %s battle round', (scope) => {
    expect(suggestReminderTimings(`At the start of ${scope} battle round, select one unit.`)).toEqual([
      { moment: 'round-start', phase: null, turn: 'either' },
    ])
  })

  it('excludes round expiry clauses from suggestions', () => {
    expect(suggestReminderTimings('This effect lasts until the end of the battle round.')).toEqual([])
  })

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

it('keys a datasheet ability by its id, whichever unit shows it', () => {
  expect(reminderKey({ id: 'living-lightning-id', kind: 'datasheet', name: 'Living Lightning' })).toBe('datasheet:living-lightning-id')
})

it('keys a faction ability by its name', () => {
  expect(reminderKey({ id: 'faction-copy', kind: 'faction', name: 'Oath of Moment' })).toBe('faction:oath-of-moment')
})

it('keys a core ability by its name, since every datasheet links it under its own id', () => {
  expect(reminderKey({ id: 'per-datasheet-link', kind: 'core', name: 'Deep Strike' })).toBe('core:deep-strike')
})

it('keys a detachment rule by its detachment', () => {
  expect(reminderKey(detachmentRuleSubject('c4ee-83c7', { name: 'Cold Fervour', description: null }))).toBe(
    'detachment:c4ee-83c7/cold-fervour',
  )
})

describe('fieldedReminders', () => {
  const timings = [{ moment: 'turn-start' as const, phase: null, turn: 'your-turn' as const }]
  const setting = (key: string) => ({ key, ability: key, description: '', timings })
  const unit = (key: number, choices: { kind?: 'enhancement' | 'upgrade'; chosen: string }[] = []) => ({
    key,
    name: `Unit ${key}`,
    choices,
  })
  const field = (settings: ReturnType<typeof setting>[], shown: [number, string[]][], detachmentIds: string[] = []) =>
    fieldedReminders(settings, { detachmentIds, units: shown.map(([key]) => unit(key)) }, shown)

  it('alerts once for each unit holding the ability', () => {
    expect(
      field(
        [setting('datasheet:shared')],
        [
          [0, ['datasheet:shared']],
          [3, ['datasheet:shared']],
        ],
      ),
    ).toEqual([
      { ...setting('datasheet:shared'), key: 'datasheet:shared:0', unit: { index: 0, name: 'Unit 0' } },
      { ...setting('datasheet:shared'), key: 'datasheet:shared:3', unit: { index: 3, name: 'Unit 3' } },
    ])
  })

  it('leaves out a unit ability no unit holds', () => {
    expect(field([setting('datasheet:elsewhere')], [[0, ['datasheet:shared']]])).toEqual([])
  })

  it('alerts for an enhancement a unit has chosen', () => {
    expect(
      fieldedReminders(
        [setting('enhancement:casket')],
        { detachmentIds: [], units: [unit(1, [{ kind: 'enhancement', chosen: 'casket' }])] },
        [],
      ).map((reminder) => reminder.key),
    ).toEqual(['enhancement:casket:1'])
  })

  it('alerts once for a faction ability any unit holds', () => {
    expect(
      field(
        [setting('faction:oath')],
        [
          [0, ['faction:oath']],
          [1, ['faction:oath']],
        ],
      ),
    ).toEqual([{ ...setting('faction:oath'), key: 'faction:oath:army' }])
  })

  it('leaves out a faction ability of another army', () => {
    expect(field([setting('faction:oath')], [[0, ['faction:reanimation']]])).toEqual([])
  })

  it('keeps a rule of a detachment the roster fields', () => {
    expect(field([setting('detachment:kept/rule')], [], ['kept'])).toEqual([
      { ...setting('detachment:kept/rule'), key: 'detachment:kept/rule:army' },
    ])
  })

  it('leaves out a rule of a detachment the roster does not field', () => {
    expect(field([setting('detachment:other/rule')], [], ['kept'])).toEqual([])
  })

  it('keeps a battle within the roster reminder limit', () => {
    const shown = Array.from({ length: ROSTER_REMINDERS_MAX + 1 }, (_, key): [number, string[]] => [key, ['datasheet:shared']])
    expect(field([setting('datasheet:shared')], shown)).toHaveLength(ROSTER_REMINDERS_MAX)
  })

  it('never lets another army’s detachment rule take a place within the limit', () => {
    const shown = Array.from({ length: ROSTER_REMINDERS_MAX }, (_, key): [number, string[]] => [key, ['datasheet:shared']])
    expect(
      field([setting('detachment:other/rule'), setting('datasheet:shared')], shown, ['kept']).filter((reminder) => reminder.unit),
    ).toHaveLength(ROSTER_REMINDERS_MAX)
  })
})

describe('abilityReminderFits', () => {
  const held = Array.from({ length: ABILITY_REMINDERS_MAX }, (_, at) => ({ key: `datasheet:${at}` }))

  it('refuses a new alert once a player holds the limit', () => {
    expect(abilityReminderFits(held, 'datasheet:new')).toBe(false)
  })

  it('lets a player at the limit change an alert they hold', () => {
    expect(abilityReminderFits(held, 'datasheet:0')).toBe(true)
  })
})

describe('chosenReminderAbilities', () => {
  it('names a chosen enhancement', () => {
    expect(chosenReminderAbilities([{ kind: 'enhancement', chosen: 'casket' }])).toEqual(['enhancement:casket'])
  })

  it('ignores a declined upgrade', () => {
    expect(chosenReminderAbilities([{ kind: 'upgrade', chosen: '' }])).toEqual([])
  })
})

describe('abilityRemindersFromRosters', () => {
  const timing = (turn: 'your-turn' | 'opponent-turn') => [{ moment: 'turn-start' as const, phase: null, turn }]
  const unitReminder = (key: string, turn: 'your-turn' | 'opponent-turn' = 'your-turn') => ({
    key,
    ability: 'Living Lightning',
    description: 'Text',
    unit: { index: 2, name: 'Plasmancer' },
    timings: timing(turn),
  })

  it('keys a unit alert by its ability alone', () => {
    expect(abilityRemindersFromRosters([{ updatedAt: 1, reminders: [unitReminder('datasheet:lightning:2')] }])).toEqual([
      { key: 'datasheet:lightning', ability: 'Living Lightning', description: 'Text', timings: timing('your-turn') },
    ])
  })

  it('keeps the timings of the most recently saved roster', () => {
    expect(
      abilityRemindersFromRosters([
        { updatedAt: 1, reminders: [unitReminder('datasheet:lightning:2', 'your-turn')] },
        { updatedAt: 5, reminders: [unitReminder('datasheet:lightning:0', 'opponent-turn')] },
      ]).map((reminder) => reminder.timings),
    ).toEqual([timing('opponent-turn')])
  })

  it('rekeys a core ability alert by its name', () => {
    expect(
      abilityRemindersFromRosters([{ updatedAt: 1, reminders: [{ ...unitReminder('core:link-id:2'), ability: 'Deep Strike' }] }]).map(
        (reminder) => reminder.key,
      ),
    ).toEqual(['core:deep-strike'])
  })

  it('keys an army alert without its owner', () => {
    const { unit: _unit, ...army } = unitReminder('detachment:kept/cold-fervour:army')
    expect(abilityRemindersFromRosters([{ updatedAt: 1, reminders: [army] }]).map((reminder) => reminder.key)).toEqual([
      'detachment:kept/cold-fervour',
    ])
  })
})

describe('remindersForDetachments', () => {
  const reminder = (key: string) => ({
    key,
    ability: 'Rule',
    description: '',
    timings: [{ moment: 'turn-start' as const, phase: null, turn: 'your-turn' as const }],
  })

  it('drops alerts for a detachment the roster no longer fields', () => {
    expect(remindersForDetachments([reminder('detachment:removed/cold-fervour:army')], ['kept'])).toEqual([])
  })

  it('keeps alerts for a fielded detachment', () => {
    const kept = reminder('detachment:kept/cold-fervour:army')
    expect(remindersForDetachments([kept], ['kept'])).toEqual([kept])
  })

  it('keeps army and unit alerts', () => {
    const others = [reminder('faction:reanimation-protocols:army'), reminder('datasheet:united-in-destruction:0')]
    expect(remindersForDetachments(others, [])).toEqual(others)
  })
})

it('describes configured timing in player-facing words', () => {
  expect(reminderTimingLabel({ moment: 'turn-end', phase: null, turn: 'opponent-turn' })).toBe("End of opponent's turn")
  expect(reminderTimingLabel({ moment: 'phase-start', phase: 'command', turn: 'your-turn' })).toBe('Start of your Command phase')
})

describe('round reminder timings', () => {
  it.each(['round-start', 'round-end'])('accepts a shared %s timing', (moment) => {
    expect(reminderTimingSchema.safeParse({ moment, phase: null, turn: 'either' }).success).toBe(true)
  })

  it.each(['your-turn', 'opponent-turn'])('rejects a round timing scoped to %s', (turn) => {
    expect(reminderTimingSchema.safeParse({ moment: 'round-start', phase: null, turn }).success).toBe(false)
  })

  it('rejects a round timing with a phase', () => {
    expect(reminderTimingSchema.safeParse({ moment: 'round-end', phase: 'command', turn: 'either' }).success).toBe(false)
  })

  it.each([
    ['round-start', 'Start of round'],
    ['round-end', 'End of round'],
  ] as const)('labels %s without turn ownership', (moment, label) => {
    expect(reminderTimingLabel({ moment, phase: null, turn: 'either' })).toBe(label)
  })

  it.each([
    ['command', 0, 0, 'round-start'],
    ['command', 1, 0, null],
    ['end', 1, 0, 'round-end'],
    ['end', 0, 0, null],
    ['command', 1, 1, 'round-start'],
    ['end', 0, 1, 'round-end'],
    ['fight', 1, 0, null],
  ] as const)('places the round boundary in the %s phase of side %i when side %i went first', (phase, active, first, moment) => {
    expect(roundReminderMoment(phase, active, first)?.moment ?? null).toBe(moment)
  })
})

describe('restricted and broad reminders', () => {
  it('suggests a first-round restriction for Singular Purpose', () => {
    expect(suggestReminderTimings('At the start of the first battle round, select one enemy unit.')).toEqual([
      { moment: 'round-start', phase: null, turn: 'either', firstRoundOnly: true },
    ])
  })

  it.each(['start', 'end'] as const)('suggests the %s of any phase', (boundary) => {
    expect(suggestReminderTimings(`At the ${boundary} of any phase, you can use this ability.`)).toEqual([
      { moment: boundary === 'start' ? 'phase-start' : 'phase-end', phase: 'any', turn: 'either' },
    ])
  })

  it('suggests the end of each phase for Grotesque Regeneration', () => {
    expect(suggestReminderTimings('At the end of each phase, regain lost wounds.')).toEqual([
      { moment: 'phase-end', phase: 'any', turn: 'either' },
    ])
  })

  it('does not turn a reference to an earlier round choice into a trigger', () => {
    expect(
      suggestReminderTimings(
        'At the start of your Command phase, select the Benediction you did not select at the start of the first battle round.',
      ),
    ).toEqual([{ moment: 'phase-start', phase: 'command', turn: 'your-turn' }])
  })

  it('does not suggest a generic phase expiry', () => {
    expect(suggestReminderTimings('Until the end of any phase, this effect applies.')).toEqual([])
  })

  it.each([1, 2, undefined])('restricts first-round alerts in round %s', (round) => {
    expect(
      reminderDue(
        { moment: 'round-start', phase: null, turn: 'either', firstRoundOnly: true },
        { moment: 'round-start', phase: null, turn: 'either' },
        round,
      ),
    ).toBe(round === 1)
  })

  it('matches a broad phase alert in a named phase', () => {
    expect(
      reminderDue(
        { moment: 'phase-end', phase: 'any', turn: 'either' },
        { moment: 'phase-end', phase: 'charge', turn: 'opponent-turn' },
        1,
      ),
    ).toBe(true)
  })

  it('keeps turn ownership for a broad phase alert', () => {
    expect(
      reminderDue(
        { moment: 'phase-end', phase: 'any', turn: 'your-turn' },
        { moment: 'phase-end', phase: 'fight', turn: 'opponent-turn' },
        1,
      ),
    ).toBe(false)
  })

  it('does not match a broad phase alert to a turn boundary', () => {
    expect(reminderDue({ moment: 'phase-end', phase: 'any', turn: 'either' }, { moment: 'turn-end', phase: null, turn: 'either' }, 1)).toBe(
      false,
    )
  })

  it('labels a first-round alert', () => {
    expect(reminderTimingLabel({ moment: 'round-start', phase: null, turn: 'either', firstRoundOnly: true })).toBe(
      'Start of round · First round only',
    )
  })

  it('labels a broad phase alert', () => {
    expect(reminderTimingLabel({ moment: 'phase-end', phase: 'any', turn: 'either' })).toBe('End of any phase')
  })

  it('suggests retaining a resurrection reminder while destroyed', () => {
    expect(suggestReminderWhileDestroyed('At the start of the battle round, if this model is destroyed, you can return it.')).toBe(true)
  })

  it('does not retain ordinary reminders just because they mention destruction', () => {
    expect(suggestReminderWhileDestroyed('At the end of each phase, if this model has lost wounds but is not destroyed, heal it.')).toBe(
      false,
    )
  })
})

describe('withAbilityReminder', () => {
  const setting = (key: string, turn: 'your-turn' | 'opponent-turn' = 'your-turn') => ({
    key,
    ability: key,
    description: '',
    timings: [{ moment: 'turn-start' as const, phase: null, turn }],
  })

  it('replaces the alert already set for an ability', () => {
    expect(withAbilityReminder([setting('datasheet:a')], setting('datasheet:a', 'opponent-turn'))).toEqual([
      setting('datasheet:a', 'opponent-turn'),
    ])
  })
})
