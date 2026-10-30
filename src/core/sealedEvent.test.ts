import { describe, expect, it } from 'vitest'
import type { Roster } from './battle'
import {
  alliedSealedEventRosterLimit,
  effectiveSealedEventAllowances,
  sealedEventAllowanceOptions,
  sealedEventAllowanceRefusal,
  parseSealedEventAllowances,
  sealedEventMinimumPlaces,
  sealedEventPlacesSeat,
  sealedEventWarlordRefusal,
  sealedEventWarlordValid,
  sealedEventWarlordWaived,
  sealedEventWarlords,
  sealedEventRegistrationFull,
  sealedEventRevealChecklist,
  sealedEventStage,
  sealedEventArmy,
  sealedEventTeams,
  mayRevealSealedEvent,
  mayRemindSealedEvent,
  sealedEventReminderRecipients,
  SEALED_EVENT_REMINDER_COOLDOWN_MS,
  isSealedEventOrganizer,
  sealedEventTableShape,
  matchesSealedRoster,
  readsAlliedSealedEventRoster,
  readsSealedRoster,
  requiredSealedEventRosterLimit,
  sealedEventEntryPoints,
  sealedEventSeatRefusal,
  visibleSealedEventEntries,
  type SealedEventAllyEntry,
  type SealedEventEntryView,
  type SealedEventRevealEntry,
} from './sealedEvent'

const savedSealedEventRoster = {
  name: 'SealedEvent list',
  catalogueId: 'army',
  detachmentIds: ['detachment'],
  disposition: null,
  limit: 2_000,
  picks: [{ entryId: 'unit' }],
  waivedRules: [],
  reminders: [],
}
const sealedRoster: Roster = {
  name: 'SealedEvent list',
  text: 'SealedEvent list',
  built: {
    catalogueId: 'army',
    revision: 'revision',
    limit: 2_000,
    detachment: 'Detachment',
    detachmentIds: ['detachment'],
    disposition: null,
    picks: [{ entryId: 'unit' }],
    units: [],
  },
}

it('treats restored roster choices as the sealed list', () => {
  expect(matchesSealedRoster(savedSealedEventRoster, sealedRoster)).toBe(true)
})

it('treats a list sealed on a rules version that folded into the current rules as the saved list', () => {
  const sealed = {
    ...sealedRoster,
    built: {
      ...sealedRoster.built!,
      catalogueId: 'marine-main~470a-6daa-9014-12df',
      picks: [{ entryId: 'unit', catalogueId: 'marine-main~e0af-67df-9d63-8fb7' }],
    },
  }
  expect(
    matchesSealedRoster(
      { ...savedSealedEventRoster, catalogueId: '470a-6daa-9014-12df', picks: [{ entryId: 'unit', catalogueId: 'e0af-67df-9d63-8fb7' }] },
      sealed,
    ),
  ).toBe(true)
})

it('detects a different unit even when the roster name is unchanged', () => {
  expect(matchesSealedRoster({ ...savedSealedEventRoster, picks: [{ entryId: 'other-unit' }] }, sealedRoster)).toBe(false)
})

const entries: SealedEventEntryView[] = [
  {
    userId: 'accepted',
    name: 'Accepted',
    image: null,
    status: 'accepted',
    joinedAt: 1,
    submitted: true,
    dropped: false,
    rosterName: 'Army',
    requiredLimit: 2_000,
    sealedLimit: 2_000,
    teamId: null,
    dispositionOwed: false,
    warlordOwed: false,
  },
  {
    userId: 'pending',
    name: 'Pending',
    image: null,
    status: 'pending',
    joinedAt: 2,
    submitted: false,
    dropped: false,
    rosterName: null,
    requiredLimit: null,
    sealedLimit: null,
    teamId: null,
    dispositionOwed: false,
    warlordOwed: false,
  },
  {
    userId: 'rejected',
    name: 'Rejected',
    image: null,
    status: 'rejected',
    joinedAt: 3,
    submitted: false,
    dropped: false,
    rosterName: null,
    requiredLimit: null,
    sealedLimit: null,
    teamId: null,
    dispositionOwed: false,
    warlordOwed: false,
  },
]

it('treats a missing legacy format as 1v1', () => {
  expect(sealedEventTableShape(null)).toBe('1v1')
})

describe('visibleSealedEventEntries', () => {
  it('shows only accepted entrants to a visitor', () => {
    expect(visibleSealedEventEntries(entries, false, null).map((entry) => entry.userId)).toEqual(['accepted'])
  })

  it('shows a player their own pending entry', () => {
    expect(visibleSealedEventEntries(entries, false, 'pending').map((entry) => entry.userId)).toEqual(['accepted', 'pending'])
  })

  it('shows every entry to the organizer', () => {
    expect(visibleSealedEventEntries(entries, true, 'admin')).toEqual(entries)
  })
})

describe('sealedEvent roster requirements', () => {
  it('uses the event size for every 1v1 entrant', () => {
    expect(requiredSealedEventRosterLimit('1v1', 600, null)).toBe(600)
  })

  it('uses the per-entry assignment for a 2v1 entrant', () => {
    expect(requiredSealedEventRosterLimit('2v1', 2_000, 1_000)).toBe(1_000)
  })

  it('derives the allied size from the solo side total', () => {
    expect(alliedSealedEventRosterLimit(2_000)).toBe(1_000)
  })

  it('requires a doubles pairing before deriving half the force size', () => {
    expect(requiredSealedEventRosterLimit('2v2', 2_000, null, null)).toBeNull()
    expect(requiredSealedEventRosterLimit('2v2', 2_000, 1_000, 'team-a')).toBe(1_000)
  })

  it('gives each seat its organizer’s points, or an even share of the battle size', () => {
    const event = { format: '2v1' as const, rosterLimit: 2_000, soloPoints: 1_750, allyPoints: null }
    expect([
      sealedEventEntryPoints(event, { requiredLimit: 2_000, teamId: null }),
      sealedEventEntryPoints(event, { requiredLimit: 1_000, teamId: 'pair' }),
    ]).toEqual([1_750, 1_000])
  })

  it('refuses a list built bigger than the event’s battle size', () => {
    expect(sealedEventSeatRefusal({ limit: 3_000, units: [] }, 2_000, 1_000)).toBe('wrong-limit')
  })

  it('refuses a list spending past its seat’s points', () => {
    expect(sealedEventSeatRefusal({ limit: 1_000, units: [{ points: 850 }] }, 2_000, 800)).toBe('over-points')
  })

  it('keeps legacy events unrestricted', () => {
    expect(requiredSealedEventRosterLimit(null, null, null)).toBeNull()
  })
})

describe('readsAlliedSealedEventRoster', () => {
  const ally = (userId: string, over: Partial<SealedEventAllyEntry> = {}): SealedEventAllyEntry => ({
    userId,
    status: 'accepted',
    requiredLimit: 1_000,
    teamId: null,
    ...over,
  })

  it('pairs a doubles entrant with the teammate the organizer gave them', () => {
    const reader = ally('alice', { teamId: 'team-a' })
    expect(readsAlliedSealedEventRoster('2v2', 2_000, reader, ally('bob', { teamId: 'team-a' }))).toBe(true)
    expect(readsAlliedSealedEventRoster('2v2', 2_000, reader, ally('carol', { teamId: 'team-b' }))).toBe(false)
  })

  it('withholds a doubles roster until the organizer has paired both readers', () => {
    expect(readsAlliedSealedEventRoster('2v2', 2_000, ally('alice'), ally('bob'))).toBe(false)
  })

  it('joins every 2v1 allied entrant, who can never be seated against each other', () => {
    expect(readsAlliedSealedEventRoster('2v1', 2_000, ally('bob'), ally('carol'))).toBe(true)
  })

  it('keeps the 2v1 solo roster away from the pair who will face it', () => {
    const solo = ally('alice', { requiredLimit: 2_000 })
    expect(readsAlliedSealedEventRoster('2v1', 2_000, ally('bob'), solo)).toBe(false)
    expect(readsAlliedSealedEventRoster('2v1', 2_000, solo, ally('bob'))).toBe(false)
  })

  it('waits for the 2v1 assignment that says which side an entrant is on', () => {
    expect(readsAlliedSealedEventRoster('2v1', 2_000, ally('bob', { requiredLimit: null }), ally('carol'))).toBe(false)
  })

  it('gives a 1v1 entrant nothing, because anybody there could be the opponent', () => {
    expect(readsAlliedSealedEventRoster('1v1', 2_000, ally('alice', { requiredLimit: 2_000 }), ally('bob', { requiredLimit: 2_000 }))).toBe(
      false,
    )
    expect(readsAlliedSealedEventRoster(null, 2_000, ally('alice'), ally('bob'))).toBe(false)
  })

  it('is not a way to read your own sealed list, or to read one as a visitor', () => {
    expect(readsAlliedSealedEventRoster('2v1', 2_000, ally('bob'), ally('bob'))).toBe(false)
    expect(readsAlliedSealedEventRoster('2v1', 2_000, null, ally('bob'))).toBe(false)
  })

  it('ignores an ally who is not in the event yet', () => {
    expect(readsAlliedSealedEventRoster('2v1', 2_000, ally('bob', { status: 'pending' }), ally('carol'))).toBe(false)
    expect(readsAlliedSealedEventRoster('2v1', 2_000, ally('bob'), ally('carol', { status: 'rejected' }))).toBe(false)
  })
})

describe('readsSealedRoster', () => {
  const entry = (userId: string, requiredLimit: number | null = 1_000): SealedEventAllyEntry => ({
    userId,
    status: 'accepted',
    requiredLimit,
    teamId: null,
  })

  it('lets an entrant read their own sealed list in any format', () => {
    expect(readsSealedRoster('1v1', 2_000, entry('bob', 2_000), entry('bob', 2_000))).toBe(true)
  })

  it('lets a 2v1 ally read the other ally', () => {
    expect(readsSealedRoster('2v1', 2_000, entry('bob'), entry('carol'))).toBe(true)
  })

  it('keeps a 1v1 opponent sealed', () => {
    expect(readsSealedRoster('1v1', 2_000, entry('alice', 2_000), entry('bob', 2_000))).toBe(false)
  })
})

describe('sealedEventRegistrationFull', () => {
  it('fills an automatic event at its player limit', () => {
    expect(sealedEventRegistrationFull({ admission: 'automatic', playerLimit: 4 }, 4, 4)).toBe(true)
  })

  it('keeps an automatic event without a limit open below the member cap', () => {
    expect(sealedEventRegistrationFull({ admission: 'automatic', playerLimit: null }, 127, 127)).toBe(false)
  })

  it('lets requests wait beyond the places of an approval event', () => {
    expect(sealedEventRegistrationFull({ admission: 'approval', playerLimit: 4 }, 3, 10)).toBe(false)
  })

  it('closes an approval event once every place is accepted', () => {
    expect(sealedEventRegistrationFull({ admission: 'approval', playerLimit: 4 }, 4, 4)).toBe(true)
  })

  it('closes an approval event whose requests reach the member cap', () => {
    expect(sealedEventRegistrationFull({ admission: 'approval', playerLimit: 4 }, 3, 128)).toBe(true)
  })

  it('closes an automatic event without a limit at the member cap', () => {
    expect(sealedEventRegistrationFull({ admission: 'automatic', playerLimit: null }, 128, 128)).toBe(true)
  })
})

describe('sealedEvent places', () => {
  it('seats a 2v1 in no fewer than three places', () => {
    expect(sealedEventMinimumPlaces('2v1')).toBe(3)
  })

  it('never goes below the entrants already accepted', () => {
    expect(sealedEventMinimumPlaces('1v1', 5)).toBe(5)
  })

  it('rounds doubles up to whole teams', () => {
    expect(sealedEventMinimumPlaces('2v2', 5)).toBe(6)
  })

  it('refuses an odd limit for doubles even when it is large enough', () => {
    expect(sealedEventPlacesSeat('2v2', 5)).toBe(false)
  })

  it('accepts an even doubles limit', () => {
    expect(sealedEventPlacesSeat('2v2', 6)).toBe(true)
  })

  it('refuses a limit below the shape', () => {
    expect(sealedEventPlacesSeat('2v1', 2)).toBe(false)
  })

  it('seats any shape without a limit', () => {
    expect(sealedEventPlacesSeat('2v2', null)).toBe(true)
  })

  it('reads a legacy event as a duel', () => {
    expect(sealedEventMinimumPlaces(null)).toBe(2)
  })
})

const entry = (userId: string, over: Partial<SealedEventRevealEntry> = {}): SealedEventRevealEntry => ({
  userId,
  status: 'accepted',
  submitted: true,
  requiredLimit: null,
  teamId: null,
  dispositionOwed: false,
  warlordOwed: false,
  ...over,
})

describe('sealedEventRevealChecklist', () => {
  const ready = (checks: ReturnType<typeof sealedEventRevealChecklist>) => checks.every((check) => check.done)
  const duel = { format: '1v1' as const, rosterLimit: 2_000 }

  it('is ready when every accepted 1v1 entrant has sealed', () => {
    expect(ready(sealedEventRevealChecklist(duel, [entry('a'), entry('b'), entry('c', { status: 'pending', submitted: false })], 0))).toBe(
      true,
    )
  })

  it('refuses an event nobody has been accepted into', () => {
    expect(sealedEventRevealChecklist(duel, [entry('a', { status: 'pending' })], 0)[0]).toMatchObject({ step: 'places', done: false })
  })

  it('does not wait for a player limit to fill', () => {
    expect(sealedEventRevealChecklist(duel, [entry('a')], 0)[0]).toEqual({ step: 'places', done: true, accepted: 1 })
  })

  it('names the entrants who have not sealed', () => {
    expect(sealedEventRevealChecklist(duel, [entry('a'), entry('b', { submitted: false })], 0).at(-1)).toEqual({
      step: 'lists',
      done: false,
      waiting: ['b'],
    })
  })

  describe('2v1', () => {
    const trial = { format: '2v1' as const, rosterLimit: 2_000 }
    const sizes = (rows: SealedEventRevealEntry[]) => sealedEventRevealChecklist(trial, rows, 0).find((check) => check.step === 'sizes')

    it('is ready with one solo entrant and an allied pair', () => {
      expect(
        ready(
          sealedEventRevealChecklist(
            trial,
            [
              entry('a', { requiredLimit: 2_000 }),
              entry('b', { requiredLimit: 1_000, teamId: 'pair' }),
              entry('c', { requiredLimit: 1_000, teamId: 'pair' }),
            ],
            0,
          ),
        ),
      ).toBe(true)
    })

    it('names allied entrants without a partner', () => {
      const teams = sealedEventRevealChecklist(
        trial,
        [entry('a', { requiredLimit: 2_000 }), entry('b', { requiredLimit: 1_000, teamId: 'pair' }), entry('c', { requiredLimit: 1_000 })],
        0,
      ).find((check) => check.step === 'teams')
      expect(teams).toEqual({ step: 'teams', done: false, waiting: ['b', 'c'], short: false })
    })

    it('names the entrants still waiting for a size', () => {
      expect(sizes([entry('a', { requiredLimit: 2_000 }), entry('b'), entry('c', { requiredLimit: 1_000 })])?.waiting).toEqual(['b'])
    })

    it('needs a solo entrant', () => {
      expect(sizes([1, 2, 3].map((index) => entry(`${index}`, { requiredLimit: 1_000 })))).toMatchObject({ done: false, solo: 0 })
    })

    it('is short of players with fewer than a solo and two allies in', () => {
      expect(sizes([entry('a', { requiredLimit: 2_000 }), entry('b', { requiredLimit: 1_000 })])?.short).toBe(true)
    })

    it('is short of players to pair an ally when only two are in', () => {
      const teams = sealedEventRevealChecklist(trial, [entry('a', { requiredLimit: 2_000 }), entry('b', { requiredLimit: 1_000 })], 0).find(
        (check) => check.step === 'teams',
      )
      expect(teams).toMatchObject({ done: false, short: true })
    })

    it('is not short when three players can be resized', () => {
      expect(sizes([1, 2, 3].map((index) => entry(`${index}`, { requiredLimit: 1_000 })))?.short).toBe(false)
    })

    it('needs two allied entrants', () => {
      expect(
        sizes([entry('a', { requiredLimit: 2_000 }), entry('b', { requiredLimit: 2_000 }), entry('c', { requiredLimit: 1_000 })]),
      ).toMatchObject({ done: false, allied: 1 })
    })
  })

  describe('2v2', () => {
    const doubles = { format: '2v2' as const, rosterLimit: 2_000 }
    const paired = ['a', 'b', 'c', 'd'].map((userId, index) => entry(userId, { teamId: index < 2 ? 'team-1' : 'team-2' }))
    const check = (rows: SealedEventRevealEntry[], step: string) =>
      sealedEventRevealChecklist(doubles, rows, 0).find((candidate) => candidate.step === step)

    it('is ready with two full teams and no waiting requests', () => {
      expect(ready(sealedEventRevealChecklist(doubles, paired, 0))).toBe(true)
    })

    it('waits for every request to be answered', () => {
      expect(check([...paired, entry('e', { status: 'pending', submitted: false })], 'requests')).toEqual({
        step: 'requests',
        done: false,
        waiting: ['e'],
      })
    })

    it('names the entrants without a full team', () => {
      expect(check([...paired.slice(0, 3), entry('d')], 'teams')).toEqual({ step: 'teams', done: false, waiting: ['c', 'd'], short: false })
    })

    it('holds up an odd entrant out of every team, which only another player can pair', () => {
      expect(check([...paired, entry('e')], 'teams')).toEqual({ step: 'teams', done: false, waiting: ['e'], short: true })
    })

    it('needs two teams even when everyone is paired', () => {
      expect(check(paired.slice(0, 2), 'teams')).toMatchObject({ done: false, short: true })
    })

    it('names a team that has not settled its Force Disposition', () => {
      const owing = paired.map((row, index) => (index < 2 ? { ...row, dispositionOwed: true } : row))
      expect(check(owing, 'dispositions')).toEqual({ step: 'dispositions', done: false, waiting: ['a', 'b'] })
    })
  })

  it('ignores sizes and teams for a legacy event', () => {
    expect(sealedEventRevealChecklist({ format: null, rosterLimit: null }, [entry('a')], 0).map((check) => check.step)).toEqual([
      'places',
      'lists',
    ])
  })
})

describe('seal reminders', () => {
  const reminded = [
    { userId: 'waiting', status: 'accepted' as const, submitted: false },
    { userId: 'sealed', status: 'accepted' as const, submitted: true },
    { userId: 'pending', status: 'pending' as const, submitted: false },
    { userId: 'rejected', status: 'rejected' as const, submitted: false },
  ]

  it('reach only accepted entrants without a sealed list', () => {
    expect(sealedEventReminderRecipients({ revealedAt: null, sealBy: 100 }, reminded, 50)).toEqual(['waiting'])
  })

  it('reach nobody once the rosters are revealed', () => {
    expect(sealedEventReminderRecipients({ revealedAt: 10, sealBy: null }, reminded, 50)).toEqual([])
  })

  it('reach nobody past the roster deadline', () => {
    expect(sealedEventReminderRecipients({ revealedAt: null, sealBy: 100 }, reminded, 101)).toEqual([])
  })

  it('wait out the cooldown before another', () => {
    expect(
      [SEALED_EVENT_REMINDER_COOLDOWN_MS - 1, SEALED_EVENT_REMINDER_COOLDOWN_MS].map((elapsed) =>
        mayRemindSealedEvent(1_000, 1_000 + elapsed),
      ),
    ).toEqual([false, true])
  })
})

describe('sealedEventStage', () => {
  const open = { format: '1v1' as const, rosterLimit: 2_000, revealedAt: null }
  const revealed = { ...open, revealedAt: 1 }

  it('is empty until someone is accepted', () => {
    expect(sealedEventStage(open, [], false, 0)).toBe('empty')
  })

  it('is approving while nobody is in but requests are waiting', () => {
    expect(sealedEventStage(open, [entry('a', { status: 'pending' })], false, 0)).toBe('approving')
  })

  it('is approving while a doubles request is unanswered', () => {
    const team = (userId: string) => entry(userId, { teamId: 't1' })
    const teamTwo = (userId: string) => entry(userId, { teamId: 't2' })
    expect(
      sealedEventStage(
        { ...open, format: '2v2' },
        [team('a'), team('b'), teamTwo('c'), teamTwo('d'), entry('e', { status: 'pending' })],
        false,
        0,
      ),
    ).toBe('approving')
  })

  it('is sizing a 2v1 whose rosters are sealed but sizes unassigned', () => {
    expect(sealedEventStage({ ...open, format: '2v1' }, [entry('a'), entry('b'), entry('c')], false, 0)).toBe('sizing')
  })

  it('is pairing a 2v1 whose allies are sized but not paired', () => {
    const allied = (userId: string) => entry(userId, { requiredLimit: 1_000 })
    expect(sealedEventStage({ ...open, format: '2v1' }, [entry('a', { requiredLimit: 2_000 }), allied('b'), allied('c')], false, 0)).toBe(
      'pairing',
    )
  })

  it('is pairing doubles whose rosters are sealed but teams unassigned', () => {
    expect(sealedEventStage({ ...open, format: '2v2' }, [entry('a'), entry('b'), entry('c'), entry('d')], false, 0)).toBe('pairing')
  })

  it('is approving an approval duel whose one sealed entrant could otherwise be revealed', () => {
    expect(sealedEventStage(open, [entry('a'), entry('b', { status: 'pending', submitted: false })], false, 0)).toBe('approving')
  })

  it('is recruiting doubles whose only two players are already paired', () => {
    const team = (userId: string) => entry(userId, { teamId: 't1' })
    expect(sealedEventStage({ ...open, format: '2v2' }, [team('a'), team('b')], false, 0)).toBe('recruiting')
  })

  it('is recruiting doubles with an odd number of players', () => {
    const team = (userId: string, teamId: string) => entry(userId, { teamId })
    expect(
      sealedEventStage(
        { ...open, format: '2v2' },
        [team('a', 't1'), team('b', 't1'), team('c', 't2'), team('d', 't2'), entry('e')],
        false,
        0,
      ),
    ).toBe('recruiting')
  })

  it('is recruiting a 2v1 of two players with one unsized, since no size unblocks it', () => {
    expect(sealedEventStage({ ...open, format: '2v1' }, [entry('a', { requiredLimit: 2_000 }), entry('b')], false, 0)).toBe('recruiting')
  })

  it('is recruiting a 2v1 whose sized players are too few for a solo and two allies', () => {
    expect(
      sealedEventStage({ ...open, format: '2v1' }, [entry('a', { requiredLimit: 2_000 }), entry('b', { requiredLimit: 1_000 })], false, 0),
    ).toBe('recruiting')
  })

  it('is sizing a 2v1 whose players all have a size but none plays solo', () => {
    const allied = (userId: string) => entry(userId, { requiredLimit: 1_000 })
    expect(sealedEventStage({ ...open, format: '2v1' }, [allied('a'), allied('b'), allied('c')], false, 0)).toBe('sizing')
  })

  it('is sealing while a roster is still owed', () => {
    expect(sealedEventStage(open, [entry('a'), entry('b', { submitted: false })], false, 0)).toBe('sealing')
  })

  it('is choosing while a team owes its Force Disposition', () => {
    const team = (userId: string, teamId: string) => entry(userId, { teamId, dispositionOwed: teamId === 't1' })
    expect(
      sealedEventStage({ ...open, format: '2v2' }, [team('a', 't1'), team('b', 't1'), team('c', 't2'), team('d', 't2')], false, 0),
    ).toBe('choosing')
  })

  it('is ready whenever the reveal checklist passes, as the reveal command decides', () => {
    expect(sealedEventStage(open, [entry('a')], false, 0)).toBe('ready')
  })

  it('is playing once revealed with no finished battle', () => {
    expect(sealedEventStage(revealed, [entry('a'), entry('b')], false, 0)).toBe('playing')
  })

  it('has results once a battle has finished', () => {
    expect(sealedEventStage(revealed, [entry('a'), entry('b')], true, 0)).toBe('results')
  })
})

describe('sealedEventTeams', () => {
  const list = (disposition: string, dispositions: string[]): Roster => ({
    ...sealedRoster,
    built: { ...sealedRoster.built!, disposition, dispositions },
  })
  const pair = (one: Roster | null, other: Roster | null, pick?: string) =>
    sealedEventTeams(
      [
        { userId: 'a', status: 'accepted', teamId: 'pair', roster: one },
        { userId: 'b', status: 'accepted', teamId: 'pair', roster: other },
      ],
      new Map(pick ? [['pair', pick]] : []),
    )[0]!
  const dynasty = list('take-and-hold', ['take-and-hold', 'priority-assets'])
  const hunters = list('purge-the-foe', ['purge-the-foe'])

  it('offers every card either sealed list’s detachments offered', () => {
    expect(pair(dynasty, hunters).choices).toEqual(['take-and-hold', 'priority-assets', 'purge-the-foe'])
  })

  it('owes a choice while the lists chose different cards', () => {
    expect(pair(dynasty, hunters)).toMatchObject({ disposition: null, owed: true })
  })

  it('plays an offered card neither list chose once the pair picks it', () => {
    expect(pair(dynasty, hunters, 'priority-assets')).toMatchObject({ disposition: 'priority-assets', owed: false })
  })

  it('plays the card both lists chose without asking', () => {
    expect(pair(dynasty, list('take-and-hold', ['take-and-hold']))).toMatchObject({ disposition: 'take-and-hold', owed: false })
  })

  it('ignores a pick the sealed lists no longer offer', () => {
    expect(pair(dynasty, hunters, 'recon').owed).toBe(true)
  })

  it('asks nothing until both lists are sealed', () => {
    expect(pair(dynasty, null)).toMatchObject({ choices: [], owed: false })
  })
})

describe('a pair’s Warlord', () => {
  const led: Roster = {
    ...sealedRoster,
    built: {
      ...sealedRoster.built!,
      units: [{ key: 'lord', entryId: 'lord', name: 'Lord', models: 1, points: 0, warlord: true, group: 'character' }],
    },
  }
  const pair = (other: Roster | null, pick?: string) =>
    sealedEventTeams(
      [
        { userId: 'a', status: 'accepted', teamId: 'pair', roster: led },
        { userId: 'b', status: 'accepted', teamId: 'pair', roster: other },
      ],
      new Map(),
      new Map(pick ? [['pair', pick]] : []),
    )[0]!

  it('is owed while both sealed lists name one', () => {
    expect(pair(led)).toMatchObject({ warlordChoices: ['a', 'b'], warlord: null, warlordOwed: true })
  })

  it('is the entrant the pair picks', () => {
    expect(pair(led, 'b')).toMatchObject({ warlord: 'b', warlordOwed: false })
  })

  it('is not asked until both lists are sealed', () => {
    expect(pair(null).warlordOwed).toBe(false)
  })

  it('holds the reveal back while owed', () => {
    const owing = (userId: string) => ({
      userId,
      status: 'accepted' as const,
      submitted: true,
      requiredLimit: 1_000,
      teamId: 'pair',
      dispositionOwed: false,
      warlordOwed: true,
    })
    const checks = sealedEventRevealChecklist({ format: '2v2', rosterLimit: 2_000 }, [owing('a'), owing('b')], 0)
    expect(checks.find((check) => check.step === 'warlords')).toMatchObject({ done: false, waiting: ['a', 'b'] })
  })
})

describe('sealed Warlords', () => {
  const roster = (units: NonNullable<Roster['built']>['units']): Roster => ({
    ...sealedRoster,
    built: { ...sealedRoster.built!, units },
  })
  const unit = { key: 'leader', entryId: 'leader', name: 'Leader', models: 1, points: 0, warlord: true, group: 'character' as const }
  it('counts no Warlord in an empty roster', () => {
    expect(sealedEventWarlords([roster([])])).toEqual({ count: 0, eligible: true })
  })
  it('counts one eligible Warlord across allied rosters', () => {
    expect(sealedEventWarlords([roster([unit]), roster([])])).toEqual({ count: 1, eligible: true })
  })
  it('counts multiple Warlords across allied rosters', () => {
    expect(sealedEventWarlords([roster([unit]), roster([unit])])).toEqual({ count: 2, eligible: true })
  })
  it('honors an explicit ineligible Warlord over its Character group', () => {
    expect(sealedEventWarlords([roster([{ ...unit, warlordEligible: false }])])).toEqual({ count: 1, eligible: false })
  })
  it('asks a list with no Warlord to choose one', () => {
    expect(sealedEventWarlordRefusal(roster([]))).toBe('Choose a Warlord: this list has none')
  })
  it('names every Warlord when a list marks several', () => {
    expect(sealedEventWarlordRefusal(roster([unit, { ...unit, key: 'second', name: 'Lieutenant' }]))).toBe(
      'Choose one Warlord: Leader and Lieutenant are marked',
    )
  })
  it('names a Warlord that is not a Character or Epic Hero', () => {
    expect(sealedEventWarlordRefusal(roster([{ ...unit, name: 'Intercessor Squad', group: 'battleline' as const }]))).toBe(
      'Intercessor Squad can’t be your Warlord — only a Character or Epic Hero can',
    )
  })
  it('holds a doubles list to one Warlord of its own, since its pair chooses whose leads', () => {
    expect(sealedEventWarlordValid(roster([unit]))).toBe(true)
  })
  it('refuses a list without a Warlord', () => {
    expect(sealedEventWarlordValid(roster([]))).toBe(false)
  })
})

describe('what an event allows', () => {
  const roster = (built: Partial<NonNullable<Roster['built']>>): Roster => ({
    ...sealedRoster,
    built: { ...sealedRoster.built!, ...built },
  })
  const unit = { key: 'old', entryId: 'old', name: 'Land Speeder Typhoon [Legends]', models: 1, points: 100 }

  it('refuses nothing at an event from before allowances were recorded', () => {
    expect(sealedEventAllowanceRefusal(roster({ waivedRules: ['points-limit'], units: [unit] }), null)).toBeNull()
  })

  it('refuses a switched-off restriction the event does not allow', () => {
    expect(sealedEventAllowanceRefusal(roster({ waivedRules: ['points-limit'] }), [])).toBe(
      'This event keeps Points limit on. Switch it back on in the picker’s Format restrictions, then seal again.',
    )
  })

  it('seals a switched-off restriction the event allows', () => {
    expect(sealedEventAllowanceRefusal(roster({ waivedRules: ['points-limit'] }), ['points-limit'])).toBeNull()
  })

  it('refuses a Legends datasheet the event does not allow', () => {
    expect(sealedEventAllowanceRefusal(roster({ units: [unit] }), ['crucible'])).toBe(
      'This event doesn’t allow Legends datasheets, such as Land Speeder Typhoon. Remove them, then seal again.',
    )
  })

  it('seals a Legends datasheet the event allows', () => {
    expect(sealedEventAllowanceRefusal(roster({ units: [unit] }), ['legends'])).toBeNull()
  })

  it('lets a list go without a Warlord where the event allows it', () => {
    expect(sealedEventWarlordWaived(roster({ waivedRules: ['warlord'] }), ['warlord'])).toBe(true)
  })

  it('still asks a list at an event from before allowances for its Warlord', () => {
    expect(sealedEventWarlordWaived(roster({ waivedRules: ['warlord'] }), null)).toBe(false)
  })

  it('reads an event from before allowances as allowing every waiver but the Warlord', () => {
    expect(effectiveSealedEventAllowances('1v1', 2_000, null)).toEqual(['points-limit', 'detachment-points', 'legends', 'crucible'])
  })

  it('describes a 2v1 restriction at the solo size its single player builds to', () => {
    expect(sealedEventAllowanceOptions('2v1', 2_000).find((option) => option.id === 'points-limit')?.hint).toBe(
      'The roster costs at most 2,000 points',
    )
  })

  it('reads a stored rule that no longer parses as strict matched play', () => {
    expect(parseSealedEventAllowances('["legends", "retired-rule"]')).toEqual([])
  })

  it('never offers a team event lists without a Warlord, since allies choose whose leads', () => {
    expect(sealedEventAllowanceOptions('2v2', 2_000).map((option) => option.id)).not.toContain('warlord')
  })
})

describe('mayRevealSealedEvent', () => {
  it('lets the organizer reveal without playing', () => {
    expect(mayRevealSealedEvent(true, null)).toBe(true)
  })

  it('lets anyone playing reveal', () => {
    expect(mayRevealSealedEvent(false, { status: 'accepted' })).toBe(true)
  })

  it('keeps a waiting request from revealing', () => {
    expect(mayRevealSealedEvent(false, { status: 'pending' })).toBe(false)
  })

  it('keeps a reader outside the sealed event from revealing', () => {
    expect(mayRevealSealedEvent(false, null)).toBe(false)
  })
})

describe('sealedEventArmy', () => {
  const unit = (name: string, points: number, warlord = false, attachedTo?: string) => ({
    key: name,
    name,
    points,
    models: 1,
    warlord,
    ...(attachedTo ? { attachedTo } : {}),
  })
  const roster = (units: ReturnType<typeof unit>[]): Roster => ({
    name: 'Dynasty',
    text: '',
    built: {
      catalogueId: 'necrons',
      revision: 'r',
      limit: 2_000,
      detachment: 'Awakened Dynasty',
      disposition: null,
      units,
    },
  })

  it('totals the points of every unit', () => {
    expect(sealedEventArmy(roster([unit('Lord', 80, true), unit('Warriors', 200)])).points).toBe(280)
  })

  it('counts an empty built roster as zero units', () => {
    expect(sealedEventArmy(roster([])).unitCount).toBe(0)
  })

  it('counts an attached Leader and its squad as one fielded unit', () => {
    expect(sealedEventArmy(roster([unit('Lord', 80, true, 'Warriors'), unit('Warriors', 200)])).unitCount).toBe(1)
  })

  it('counts an attached squad and a standalone unit separately', () => {
    expect(sealedEventArmy(roster([unit('Lord', 80, true, 'Warriors'), unit('Warriors', 200), unit('Immortals', 150)])).unitCount).toBe(2)
  })

  it('keeps what the roster card reads of the sealed list', () => {
    expect(sealedEventArmy(roster([unit('Lord', 80, true)]))).toMatchObject({
      catalogueId: 'necrons',
      limit: 2_000,
      unitCount: 1,
      pointsBudget: null,
    })
  })

  it('shows a text-only list by name alone', () => {
    expect(sealedEventArmy({ name: 'Pasted list', text: 'units' })).toMatchObject({ name: 'Pasted list', points: null, limit: null })
  })
})

describe('isSealedEventOrganizer', () => {
  const sealedEvent = { ownerId: 'owner' }

  it('counts the owner', () => {
    expect(isSealedEventOrganizer(sealedEvent, [], 'owner')).toBe(true)
  })

  it('counts an admin the owner chose', () => {
    expect(isSealedEventOrganizer(sealedEvent, ['admin'], 'admin')).toBe(true)
  })

  it('leaves out everyone else', () => {
    expect(isSealedEventOrganizer(sealedEvent, ['admin'], 'player')).toBe(false)
  })

  it('leaves out a signed-out reader', () => {
    expect(isSealedEventOrganizer(sealedEvent, ['admin'], null)).toBe(false)
  })
})
