import { describe, expect, it } from 'vitest'
import type { Roster } from './battle'
import {
  alliedLeagueRosterLimit,
  leagueMinimumPlaces,
  leaguePlacesSeat,
  leagueWarlords,
  leagueRegistrationFull,
  leagueRevealChecklist,
  leagueRevealsItself,
  leagueArmy,
  leagueTeams,
  mayRevealLeague,
  isLeagueOrganizer,
  leagueTableShape,
  matchesSealedLeagueRoster,
  readsAlliedLeagueRoster,
  requiredLeagueRosterLimit,
  visibleLeagueEntries,
  type LeagueAllyEntry,
  type LeagueEntryView,
  type LeagueRevealEntry,
} from './league'

const savedLeagueRoster = {
  name: 'League list',
  catalogueId: 'army',
  detachmentIds: ['detachment'],
  disposition: null,
  limit: 2_000,
  picks: [{ entryId: 'unit' }],
  waivedRules: [],
  reminders: [],
}
const sealedLeagueRoster: Roster = {
  name: 'League list',
  text: 'League list',
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
  expect(matchesSealedLeagueRoster(savedLeagueRoster, sealedLeagueRoster)).toBe(true)
})

it('detects a different unit even when the roster name is unchanged', () => {
  expect(matchesSealedLeagueRoster({ ...savedLeagueRoster, picks: [{ entryId: 'other-unit' }] }, sealedLeagueRoster)).toBe(false)
})

const entries: LeagueEntryView[] = [
  {
    userId: 'accepted',
    name: 'Accepted',
    image: null,
    status: 'accepted',
    joinedAt: 1,
    submitted: true,
    rosterName: 'Army',
    requiredLimit: 2_000,
    sealedLimit: 2_000,
    teamId: null,
    dispositionOwed: false,
  },
  {
    userId: 'pending',
    name: 'Pending',
    image: null,
    status: 'pending',
    joinedAt: 2,
    submitted: false,
    rosterName: null,
    requiredLimit: null,
    sealedLimit: null,
    teamId: null,
    dispositionOwed: false,
  },
  {
    userId: 'rejected',
    name: 'Rejected',
    image: null,
    status: 'rejected',
    joinedAt: 3,
    submitted: false,
    rosterName: null,
    requiredLimit: null,
    sealedLimit: null,
    teamId: null,
    dispositionOwed: false,
  },
]

it('treats a missing legacy format as 1v1', () => {
  expect(leagueTableShape(null)).toBe('1v1')
})

describe('visibleLeagueEntries', () => {
  it('shows only accepted entrants to a visitor', () => {
    expect(visibleLeagueEntries(entries, false, null).map((entry) => entry.userId)).toEqual(['accepted'])
  })

  it('shows a player their own pending entry', () => {
    expect(visibleLeagueEntries(entries, false, 'pending').map((entry) => entry.userId)).toEqual(['accepted', 'pending'])
  })

  it('shows every entry to the organizer', () => {
    expect(visibleLeagueEntries(entries, true, 'admin')).toEqual(entries)
  })
})

describe('league roster requirements', () => {
  it('uses the event size for every 1v1 entrant', () => {
    expect(requiredLeagueRosterLimit('1v1', 600, null)).toBe(600)
  })

  it('uses the per-entry assignment for a 2v1 entrant', () => {
    expect(requiredLeagueRosterLimit('2v1', 2_000, 1_000)).toBe(1_000)
  })

  it('derives the allied size from the solo side total', () => {
    expect(alliedLeagueRosterLimit(2_000)).toBe(1_000)
  })

  it('requires a doubles pairing before deriving half the force size', () => {
    expect(requiredLeagueRosterLimit('2v2', 2_000, null, null)).toBeNull()
    expect(requiredLeagueRosterLimit('2v2', 2_000, 1_000, 'team-a')).toBe(1_000)
  })

  it('keeps legacy events unrestricted', () => {
    expect(requiredLeagueRosterLimit(null, null, null)).toBeNull()
  })
})

describe('readsAlliedLeagueRoster', () => {
  const ally = (userId: string, over: Partial<LeagueAllyEntry> = {}): LeagueAllyEntry => ({
    userId,
    status: 'accepted',
    requiredLimit: 1_000,
    teamId: null,
    ...over,
  })

  it('pairs a doubles entrant with the teammate the organizer gave them', () => {
    const reader = ally('alice', { teamId: 'team-a' })
    expect(readsAlliedLeagueRoster('2v2', 2_000, reader, ally('bob', { teamId: 'team-a' }))).toBe(true)
    expect(readsAlliedLeagueRoster('2v2', 2_000, reader, ally('carol', { teamId: 'team-b' }))).toBe(false)
  })

  it('withholds a doubles roster until the organizer has paired both readers', () => {
    expect(readsAlliedLeagueRoster('2v2', 2_000, ally('alice'), ally('bob'))).toBe(false)
  })

  it('joins every 2v1 allied entrant, who can never be seated against each other', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), ally('carol'))).toBe(true)
  })

  it('keeps the 2v1 solo roster away from the pair who will face it', () => {
    const solo = ally('alice', { requiredLimit: 2_000 })
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), solo)).toBe(false)
    expect(readsAlliedLeagueRoster('2v1', 2_000, solo, ally('bob'))).toBe(false)
  })

  it('waits for the 2v1 assignment that says which side an entrant is on', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob', { requiredLimit: null }), ally('carol'))).toBe(false)
  })

  it('gives a 1v1 entrant nothing, because anybody there could be the opponent', () => {
    expect(readsAlliedLeagueRoster('1v1', 2_000, ally('alice', { requiredLimit: 2_000 }), ally('bob', { requiredLimit: 2_000 }))).toBe(
      false,
    )
    expect(readsAlliedLeagueRoster(null, 2_000, ally('alice'), ally('bob'))).toBe(false)
  })

  it('is not a way to read your own sealed list, or to read one as a visitor', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), ally('bob'))).toBe(false)
    expect(readsAlliedLeagueRoster('2v1', 2_000, null, ally('bob'))).toBe(false)
  })

  it('ignores an ally who is not in the event yet', () => {
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob', { status: 'pending' }), ally('carol'))).toBe(false)
    expect(readsAlliedLeagueRoster('2v1', 2_000, ally('bob'), ally('carol', { status: 'rejected' }))).toBe(false)
  })
})

describe('leagueRegistrationFull', () => {
  it('fills an automatic event at its player limit', () => {
    expect(leagueRegistrationFull({ admission: 'automatic', playerLimit: 4 }, 4, 4)).toBe(true)
  })

  it('keeps an automatic event without a limit open below the member cap', () => {
    expect(leagueRegistrationFull({ admission: 'automatic', playerLimit: null }, 127, 127)).toBe(false)
  })

  it('lets requests wait beyond the places of an approval event', () => {
    expect(leagueRegistrationFull({ admission: 'approval', playerLimit: 4 }, 3, 10)).toBe(false)
  })

  it('closes an approval event once every place is accepted', () => {
    expect(leagueRegistrationFull({ admission: 'approval', playerLimit: 4 }, 4, 4)).toBe(true)
  })

  it('closes an approval event whose requests reach the member cap', () => {
    expect(leagueRegistrationFull({ admission: 'approval', playerLimit: 4 }, 3, 128)).toBe(true)
  })

  it('closes an automatic event without a limit at the member cap', () => {
    expect(leagueRegistrationFull({ admission: 'automatic', playerLimit: null }, 128, 128)).toBe(true)
  })
})

describe('league places', () => {
  it('seats a 2v1 in no fewer than three places', () => {
    expect(leagueMinimumPlaces('2v1')).toBe(3)
  })

  it('never goes below the entrants already accepted', () => {
    expect(leagueMinimumPlaces('1v1', 5)).toBe(5)
  })

  it('rounds doubles up to whole teams', () => {
    expect(leagueMinimumPlaces('2v2', 5)).toBe(6)
  })

  it('refuses an odd limit for doubles even when it is large enough', () => {
    expect(leaguePlacesSeat('2v2', 5)).toBe(false)
  })

  it('accepts an even doubles limit', () => {
    expect(leaguePlacesSeat('2v2', 6)).toBe(true)
  })

  it('refuses a limit below the shape', () => {
    expect(leaguePlacesSeat('2v1', 2)).toBe(false)
  })

  it('seats any shape without a limit', () => {
    expect(leaguePlacesSeat('2v2', null)).toBe(true)
  })

  it('reads a legacy event as a duel', () => {
    expect(leagueMinimumPlaces(null)).toBe(2)
  })
})

describe('leagueRevealChecklist', () => {
  const entry = (userId: string, over: Partial<LeagueRevealEntry> = {}): LeagueRevealEntry => ({
    userId,
    status: 'accepted',
    submitted: true,
    requiredLimit: null,
    teamId: null,
    dispositionOwed: false,
    ...over,
  })
  const ready = (checks: ReturnType<typeof leagueRevealChecklist>) => checks.every((check) => check.done)
  const duel = { format: '1v1' as const, rosterLimit: 2_000 }

  it('is ready when every accepted 1v1 entrant has sealed', () => {
    expect(ready(leagueRevealChecklist(duel, [entry('a'), entry('b'), entry('c', { status: 'pending', submitted: false })]))).toBe(true)
  })

  it('refuses an event nobody has been accepted into', () => {
    expect(leagueRevealChecklist(duel, [entry('a', { status: 'pending' })])[0]).toMatchObject({ step: 'places', done: false })
  })

  it('does not wait for a player limit to fill', () => {
    expect(leagueRevealChecklist(duel, [entry('a')])[0]).toEqual({ step: 'places', done: true, accepted: 1 })
  })

  it('names the entrants who have not sealed', () => {
    expect(leagueRevealChecklist(duel, [entry('a'), entry('b', { submitted: false })]).at(-1)).toEqual({
      step: 'lists',
      done: false,
      waiting: ['b'],
    })
  })

  describe('2v1', () => {
    const trial = { format: '2v1' as const, rosterLimit: 2_000 }
    const sizes = (rows: LeagueRevealEntry[]) => leagueRevealChecklist(trial, rows).find((check) => check.step === 'sizes')

    it('is ready with one solo entrant and an allied pair', () => {
      expect(
        ready(
          leagueRevealChecklist(trial, [
            entry('a', { requiredLimit: 2_000 }),
            entry('b', { requiredLimit: 1_000, teamId: 'pair' }),
            entry('c', { requiredLimit: 1_000, teamId: 'pair' }),
          ]),
        ),
      ).toBe(true)
    })

    it('names allied entrants without a partner', () => {
      const teams = leagueRevealChecklist(trial, [
        entry('a', { requiredLimit: 2_000 }),
        entry('b', { requiredLimit: 1_000, teamId: 'pair' }),
        entry('c', { requiredLimit: 1_000 }),
      ]).find((check) => check.step === 'teams')
      expect(teams).toEqual({ step: 'teams', done: false, waiting: ['b', 'c'] })
    })

    it('names the entrants still waiting for a size', () => {
      expect(sizes([entry('a', { requiredLimit: 2_000 }), entry('b'), entry('c', { requiredLimit: 1_000 })])?.waiting).toEqual(['b'])
    })

    it('needs a solo entrant', () => {
      expect(sizes([1, 2, 3].map((index) => entry(`${index}`, { requiredLimit: 1_000 })))).toMatchObject({ done: false, solo: 0 })
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
    const check = (rows: LeagueRevealEntry[], step: string) =>
      leagueRevealChecklist(doubles, rows).find((candidate) => candidate.step === step)

    it('is ready with two full teams and no waiting requests', () => {
      expect(ready(leagueRevealChecklist(doubles, paired))).toBe(true)
    })

    it('waits for every request to be answered', () => {
      expect(check([...paired, entry('e', { status: 'pending', submitted: false })], 'requests')).toEqual({
        step: 'requests',
        done: false,
        waiting: ['e'],
      })
    })

    it('names the entrants without a full team', () => {
      expect(check([...paired.slice(0, 3), entry('d')], 'teams')).toEqual({ step: 'teams', done: false, waiting: ['c', 'd'] })
    })

    it('holds up an odd entrant out of every team', () => {
      expect(check([...paired, entry('e')], 'teams')).toEqual({ step: 'teams', done: false, waiting: ['e'] })
    })

    it('needs two teams even when everyone is paired', () => {
      expect(check(paired.slice(0, 2), 'teams')?.done).toBe(false)
    })

    it('names a team that has not settled its Force Disposition', () => {
      const owing = paired.map((row, index) => (index < 2 ? { ...row, dispositionOwed: true } : row))
      expect(check(owing, 'dispositions')).toEqual({ step: 'dispositions', done: false, waiting: ['a', 'b'] })
    })
  })

  it('ignores sizes and teams for a legacy event', () => {
    expect(leagueRevealChecklist({ format: null, rosterLimit: null }, [entry('a')]).map((check) => check.step)).toEqual(['places', 'lists'])
  })
})

describe('leagueTeams', () => {
  const list = (disposition: string, dispositions: string[]): Roster => ({
    ...sealedLeagueRoster,
    built: { ...sealedLeagueRoster.built!, disposition, dispositions },
  })
  const pair = (one: Roster | null, other: Roster | null, pick?: string) =>
    leagueTeams(
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

describe('sealed Warlords', () => {
  const roster = (units: NonNullable<Roster['built']>['units']): Roster => ({
    ...sealedLeagueRoster,
    built: { ...sealedLeagueRoster.built!, units },
  })
  const unit = { key: 'leader', entryId: 'leader', name: 'Leader', models: 1, points: 0, warlord: true, group: 'character' as const }
  it('counts no Warlord in an empty roster', () => {
    expect(leagueWarlords([roster([])])).toEqual({ count: 0, eligible: true })
  })
  it('counts one eligible Warlord across allied rosters', () => {
    expect(leagueWarlords([roster([unit]), roster([])])).toEqual({ count: 1, eligible: true })
  })
  it('counts multiple Warlords across allied rosters', () => {
    expect(leagueWarlords([roster([unit]), roster([unit])])).toEqual({ count: 2, eligible: true })
  })
  it('honors an explicit ineligible Warlord over its Character group', () => {
    expect(leagueWarlords([roster([{ ...unit, warlordEligible: false }])])).toEqual({ count: 1, eligible: false })
  })
})

describe('leagueRevealsItself', () => {
  const sealed = (userId: string): LeagueRevealEntry => ({
    userId,
    status: 'accepted',
    submitted: true,
    requiredLimit: null,
    teamId: null,
    dispositionOwed: false,
  })
  const duel = { format: '1v1' as const, rosterLimit: 2_000 }

  it('opens a full event once every list is sealed', () => {
    expect(leagueRevealsItself({ ...duel, playerLimit: 2 }, [sealed('a'), sealed('b')])).toBe(true)
  })

  it('waits for an empty place', () => {
    expect(leagueRevealsItself({ ...duel, playerLimit: 3 }, [sealed('a'), sealed('b')])).toBe(false)
  })

  it('waits for an unsealed list', () => {
    expect(leagueRevealsItself({ ...duel, playerLimit: 2 }, [sealed('a'), { ...sealed('b'), submitted: false }])).toBe(false)
  })

  it('leaves an event without a limit to the organizer', () => {
    expect(leagueRevealsItself({ ...duel, playerLimit: null }, [sealed('a'), sealed('b')])).toBe(false)
  })
})

describe('mayRevealLeague', () => {
  it('lets the organizer reveal without playing', () => {
    expect(mayRevealLeague(true, null)).toBe(true)
  })

  it('lets anyone playing reveal', () => {
    expect(mayRevealLeague(false, { status: 'accepted' })).toBe(true)
  })

  it('keeps a waiting request from revealing', () => {
    expect(mayRevealLeague(false, { status: 'pending' })).toBe(false)
  })

  it('keeps a reader outside the league from revealing', () => {
    expect(mayRevealLeague(false, null)).toBe(false)
  })
})

describe('leagueArmy', () => {
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
    expect(leagueArmy(roster([unit('Lord', 80, true), unit('Warriors', 200)])).points).toBe(280)
  })

  it('counts an empty built roster as zero units', () => {
    expect(leagueArmy(roster([])).unitCount).toBe(0)
  })

  it('counts an attached Leader and its squad as one fielded unit', () => {
    expect(leagueArmy(roster([unit('Lord', 80, true, 'Warriors'), unit('Warriors', 200)])).unitCount).toBe(1)
  })

  it('counts an attached squad and a standalone unit separately', () => {
    expect(leagueArmy(roster([unit('Lord', 80, true, 'Warriors'), unit('Warriors', 200), unit('Immortals', 150)])).unitCount).toBe(2)
  })

  it('keeps what the roster card reads of the sealed list', () => {
    expect(leagueArmy(roster([unit('Lord', 80, true)]))).toMatchObject({
      catalogueId: 'necrons',
      limit: 2_000,
      unitCount: 1,
      pointsBudget: null,
    })
  })

  it('shows a text-only list by name alone', () => {
    expect(leagueArmy({ name: 'Pasted list', text: 'units' })).toMatchObject({ name: 'Pasted list', points: null, limit: null })
  })
})

describe('isLeagueOrganizer', () => {
  const league = { ownerId: 'owner' }

  it('counts the owner', () => {
    expect(isLeagueOrganizer(league, [], 'owner')).toBe(true)
  })

  it('counts an admin the owner chose', () => {
    expect(isLeagueOrganizer(league, ['admin'], 'admin')).toBe(true)
  })

  it('leaves out everyone else', () => {
    expect(isLeagueOrganizer(league, ['admin'], 'player')).toBe(false)
  })

  it('leaves out a signed-out reader', () => {
    expect(isLeagueOrganizer(league, ['admin'], null)).toBe(false)
  })
})
