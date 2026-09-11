import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { leagueEventEntries, leagueEvents, leagues } from '../db/schema'
import type { PraetoriumService } from './service'
import {
  befriend,
  database,
  enrol,
  leagueSnapshot,
  refusalStatus,
  revealedDoublesLeague,
  revealedLeague,
  revealedTeamLeague,
  saveAndSealLeagueRoster,
  saveLeagueRoster,
  service,
  withSecondWarlord,
  view,
} from './serviceTestHarness'

it('creates a battle from the exact two sealed league snapshots', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)
  const screen = await view(battle.token, 'alice')
  const rosters = await Promise.all([service.leagueRoster(league.token, 'alice'), service.leagueRoster(league.token, 'dave')])

  // The view carries the frozen units once, on the player, and the roster beside them without its copy.
  const withoutUnits = (roster: (typeof rosters)[number]) => {
    if (!roster?.built) return roster
    const { units: _units, ...built } = roster.built
    return { ...roster, built }
  }
  expect(screen.players.map((player) => [player.id, player.roster])).toEqual([
    ['alice', withoutUnits(rosters[0])],
    ['dave', withoutUnits(rosters[1])],
  ])
  expect(screen.players.map((player) => player.units.map((unit) => ({ key: unit.key, points: unit.points })))).toEqual([
    rosters[0]?.built?.units.map((unit) => ({ key: unit.key, points: unit.points })),
    rosters[1]?.built?.units.map((unit) => ({ key: unit.key, points: unit.points })),
  ])
})

it('finds a revealed league for the exact casual battle seats', async () => {
  const league = await revealedLeague()

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([
    {
      token: league.token,
      name: 'League',
      eventToken: league.eventToken,
      eventNumber: 1,
      format: '1v1',
    },
  ])
})

it('treats a legacy revealed league as a 1v1 casual battle match', async () => {
  const league = await revealedLeague()
  await database.update(leagueEvents).set({ format: null, rosterLimit: null }).where(eq(leagueEvents.token, league.eventToken))

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([
    {
      token: league.token,
      name: 'League',
      eventToken: league.eventToken,
      eventNumber: 1,
      format: '1v1',
    },
  ])
})

it('does not advertise a legacy league battle between different roster sizes', async () => {
  const league = await revealedLeague()
  await database.update(leagueEvents).set({ format: null, rosterLimit: null }).where(eq(leagueEvents.token, league.eventToken))
  await database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Dave Incursion', 1_000)) })
    .where(eq(leagueEventEntries.userId, 'dave'))

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([])
})

it('does not advertise a legacy league battle with an unsupported roster size', async () => {
  const league = await revealedLeague()
  await database.update(leagueEvents).set({ format: null, rosterLimit: null }).where(eq(leagueEvents.token, league.eventToken))
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Legacy roster', 1_500)) })

  await expect(service.leagueBattleOptions('alice', { opponentId: 'dave' })).resolves.toEqual([])
})

it('requires an explicit casual confirmation for a revealed league matchup', async () => {
  await revealedLeague()
  await befriend('alice', 'dave')

  expect(await refusalStatus(() => service.createBattle('alice', { opponentId: 'dave', limit: 2_000, missionPackId: null }))).toBe(409)
  await expect(
    service.createBattle('alice', { opponentId: 'dave', limit: 2_000, missionPackId: null, casual: true }),
  ).resolves.toMatchObject({ token: expect.any(String) })
})

it('creates a 2v1 league battle when the solo entrant opens it', async () => {
  const league = await revealedTeamLeague()

  const battle = await service.createLeagueBattle('alice', league.token, 'bob', null, league.eventToken, undefined, 'carol')
  const screen = await view(battle.token, 'alice')

  expect(screen.players.map((player) => [player.id, player.side, player.roster?.built?.limit])).toEqual([
    ['alice', 0, 2_000],
    ['bob', 1, 1_000],
    ['carol', 1, 1_000],
  ])
})

it('only offers a 2v1 league for seats that preserve its assigned sides', async () => {
  const league = await revealedTeamLeague()

  await expect(service.leagueBattleOptions('alice', { opponentIds: ['bob', 'carol'] })).resolves.toMatchObject([
    { token: league.token, eventToken: league.eventToken, format: '2v1' },
  ])
  await expect(service.leagueBattleOptions('alice', { opponentId: 'bob', allyId: 'carol' })).resolves.toEqual([])
})

it('creates a 2v1 league battle when an allied entrant opens it', async () => {
  const league = await revealedTeamLeague()

  const battle = await service.createLeagueBattle('bob', league.token, 'alice', null, league.eventToken, 'carol')
  const screen = await view(battle.token, 'bob')

  expect(screen.players.map((player) => [player.id, player.side])).toEqual([
    ['bob', 0],
    ['carol', 0],
    ['alice', 1],
  ])
})

it('refuses a 2v1 battle whose assigned roles do not form one solo side and one allied side', async () => {
  const league = await revealedTeamLeague()

  expect(await refusalStatus(() => service.createLeagueBattle('bob', league.token, 'carol', null, league.eventToken, 'alice'))).toBe(409)
})

it('creates a doubles league battle from fixed teams and sealed half-size rosters', async () => {
  const league = await revealedDoublesLeague()

  const battle = await service.createLeagueBattle('alice', league.token, 'carol', null, league.eventToken)
  const screen = await view(battle.token, 'alice')

  expect(screen.players.map((player) => [player.id, player.side, player.roster?.built?.limit])).toEqual([
    ['alice', 0, 1_000],
    ['bob', 0, 1_000],
    ['carol', 1, 1_000],
    ['dave', 1, 1_000],
  ])
})

it('only offers a doubles league for the fixed teams', async () => {
  const league = await revealedDoublesLeague()

  await expect(service.leagueBattleOptions('alice', { allyId: 'bob', opponentIds: ['carol', 'dave'] })).resolves.toMatchObject([
    { token: league.token, eventToken: league.eventToken, format: '2v2' },
  ])
  await expect(service.leagueBattleOptions('alice', { allyId: 'carol', opponentIds: ['bob', 'dave'] })).resolves.toEqual([])
})

it('keeps the selected doubles opponent in the first opposing seat', async () => {
  const league = await revealedDoublesLeague()

  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null, league.eventToken)
  const screen = await view(battle.token, 'alice')

  expect(screen.players.map((player) => player.id)).toEqual(['alice', 'bob', 'dave', 'carol'])
})

it('refuses a doubles battle against the creator’s own fixed team', async () => {
  const league = await revealedDoublesLeague()

  expect(await refusalStatus(() => service.createLeagueBattle('alice', league.token, 'bob', null, league.eventToken))).toBe(409)
})

it('atomically re-pairs doubles entrants and clears every affected seal', async () => {
  await enrol('dave', 'Dave')
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 })
  for (const userId of ['alice', 'bob', 'carol', 'dave']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await service.assignLeagueTeam(token, 'alice', ['carol', 'dave'])
  for (const userId of ['alice', 'bob', 'carol', 'dave']) {
    await saveAndSealLeagueRoster(token, userId, 1_000, '', userId === 'alice' || userId === 'carol')
  }

  await service.assignLeagueTeam(token, 'alice', ['alice', 'carol'])
  const league = await service.league(token, 'alice')

  expect(league?.entries.map((entry) => [entry.userId, entry.teamId !== null, entry.submitted])).toEqual([
    ['alice', true, false],
    ['bob', false, false],
    ['carol', true, false],
    ['dave', false, false],
  ])
})

it('rejects the seal that would complete a doubles team without exactly one Warlord', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 })
  for (const userId of ['alice', 'bob']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await saveAndSealLeagueRoster(token, 'alice', 1_000, '', false)

  let refusal: Response | null = null
  try {
    await saveAndSealLeagueRoster(token, 'bob', 1_000, '', false)
  } catch (error) {
    if (error instanceof Response) refusal = error
  }
  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'a doubles team must seal exactly one Character or Epic Hero Warlord between both rosters',
  })
  expect((await service.league(token, 'bob'))?.entries.find((entry) => entry.userId === 'bob')).toMatchObject({ submitted: false })
})

it('rejects a standard league roster without exactly one eligible Warlord', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await service.joinLeague(token, 'alice')
  await service.saveRoster('alice', {
    id: 'alice-strike-force',
    name: 'Alice Strike Force',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const saved = await service.ownRoster('alice', 'alice-strike-force')
  if (!saved) throw new Error('expected saved Strike Force roster')

  let refusal: Response | null = null
  try {
    await service.submitLeagueRoster(token, 'alice', saved, leagueSnapshot('Alice Strike Force', 2_000, false))
  } catch (error) {
    if (error instanceof Response) refusal = error
  }

  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'a league roster must seal exactly one Character or Epic Hero Warlord',
  })
  expect((await service.league(token, 'alice'))?.entries.find((entry) => entry.userId === 'alice')).toMatchObject({ submitted: false })
})

it('accepts catalogue-derived Warlord eligibility on an upgraded unit', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await service.joinLeague(token, 'alice')
  await service.saveRoster('alice', {
    id: 'alice-tank-ace',
    name: 'Alice Tank Ace',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const saved = await service.ownRoster('alice', 'alice-tank-ace')
  if (!saved) throw new Error('expected saved Tank Ace roster')

  await expect(
    service.submitLeagueRoster(token, 'alice', saved, leagueSnapshot('Alice Tank Ace', 2_000, true, 'vehicle', true)),
  ).resolves.toMatchObject({ outcome: 'sealed' })
})

it('rejects a standard replacement with multiple eligible Warlords', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await service.joinLeague(token, 'alice')
  await saveAndSealLeagueRoster(token, 'alice', 2_000)
  const replacement = await saveLeagueRoster('alice', 2_000, '-replacement')

  const status = await refusalStatus(() =>
    service.submitLeagueRoster(token, 'alice', replacement, withSecondWarlord(leagueSnapshot('alice-replacement sealed', 2_000))),
  )
  const entry = (await service.league(token, 'alice'))?.entries.find((candidate) => candidate.userId === 'alice')

  expect({ status, submitted: entry?.submitted, rosterName: entry?.rosterName }).toEqual({
    status: 409,
    submitted: true,
    rosterName: 'alice sealed',
  })
})

it('rejects a first doubles seal with multiple eligible Warlords', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 })
  for (const userId of ['alice', 'bob']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  const saved = await saveLeagueRoster('alice', 1_000)

  const status = await refusalStatus(() =>
    service.submitLeagueRoster(token, 'alice', saved, withSecondWarlord(leagueSnapshot('alice sealed', 1_000))),
  )
  const entry = (await service.league(token, 'alice'))?.entries.find((candidate) => candidate.userId === 'alice')

  expect({ status, submitted: entry?.submitted }).toEqual({ status: 409, submitted: false })
})

it('revalidates standard Warlords before revealing existing sealed snapshots', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  for (const userId of ['alice', 'bob']) {
    await service.joinLeague(token, userId)
    await saveAndSealLeagueRoster(token, userId, 2_000)
  }
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Old invalid seal', 2_000, false)) })

  let refusal: Response | null = null
  try {
    await service.revealLeague(token, 'alice')
  } catch (error) {
    if (error instanceof Response) refusal = error
  }

  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'each league roster must select exactly one eligible Warlord before reveal',
  })
})

it('reveals an older upgraded Warlord without a frozen eligibility marker', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Strike Force league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  for (const userId of ['alice', 'bob']) {
    await service.joinLeague(token, userId)
    await saveAndSealLeagueRoster(token, userId, 2_000)
  }
  await database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Old upgraded Warlord', 2_000, true, 'vehicle')) })

  await expect(service.revealLeague(token, 'alice')).resolves.toBeUndefined()
})

it('rejects a replacement that would give a doubles team two Warlords', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 })
  for (const userId of ['alice', 'bob']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await saveAndSealLeagueRoster(token, 'alice', 1_000, '', false)
  await saveAndSealLeagueRoster(token, 'bob', 1_000, '', true)

  expect(await refusalStatus(() => saveAndSealLeagueRoster(token, 'alice', 1_000, '-replacement', true))).toBe(409)
  expect((await service.league(token, 'alice'))?.entries.find((entry) => entry.userId === 'alice')).toMatchObject({
    submitted: true,
    rosterName: 'alice sealed',
  })
})

it('explains the exact doubles Warlord requirement when reveal is refused', async () => {
  await enrol('dave', 'Dave')
  const { token } = await service.createLeague('alice', {
    name: 'Doubles league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 4,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 })
  for (const userId of ['alice', 'bob', 'carol', 'dave']) await service.joinLeague(token, userId)
  await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
  await service.assignLeagueTeam(token, 'alice', ['carol', 'dave'])
  for (const userId of ['alice', 'bob', 'carol', 'dave']) {
    await saveAndSealLeagueRoster(token, userId, 1_000, '', userId === 'alice' || userId === 'carol')
  }
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Invalid doubles roster', 1_000)) })

  let refusal: Response | null = null
  try {
    await service.revealLeague(token, 'alice')
  } catch (error) {
    if (error instanceof Response) refusal = error
  }

  expect(refusal && { status: refusal.status, message: await refusal.text() }).toEqual({
    status: 409,
    message: 'each doubles team must select exactly one eligible Warlord before reveal',
  })
})

it('requires an assigned 2v1 roster size and clears a seal when that assignment changes', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 })
  await service.joinLeague(token, 'bob')
  await service.saveRoster('bob', {
    id: 'bob-team-roster',
    name: 'Bob team roster',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 1_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const saved = await service.ownRoster('bob', 'bob-team-roster')
  if (!saved) throw new Error('expected saved team roster')

  expect(await refusalStatus(() => service.submitLeagueRoster(token, 'bob', saved, leagueSnapshot('Bob sealed', 1_000)))).toBe(409)
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 1_000)
  await service.saveRoster('bob', {
    id: 'bob-wrong-size-roster',
    name: 'Bob wrong size',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const wrongSize = await service.ownRoster('bob', 'bob-wrong-size-roster')
  if (!wrongSize) throw new Error('expected wrong-size roster')
  expect(await refusalStatus(() => service.submitLeagueRoster(token, 'bob', wrongSize, leagueSnapshot('Wrong size', 2_000)))).toBe(409)
  await service.submitLeagueRoster(token, 'bob', saved, leagueSnapshot('Bob sealed', 1_000))
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 2_000)

  expect((await service.league(token, 'bob'))?.entries[0]).toEqual(
    expect.objectContaining({ requiredLimit: 2_000, submitted: false, rosterName: null }),
  )
})

it('only lets the organizer assign sizes before reveal', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 })
  await service.joinLeague(token, 'bob')

  expect(await refusalStatus(() => service.assignLeagueRosterRequirement(token, 'bob', 'bob', 1_000))).toBe(403)

  const revealed = await revealedTeamLeague()
  expect(await refusalStatus(() => service.assignLeagueRosterRequirement(revealed.token, 'alice', 'bob', 2_000))).toBe(409)
})

it('refuses reveal until a 2v1 event has one solo and two allied entrants', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 })
  await service.joinLeague(token, 'alice')
  await service.joinLeague(token, 'bob')
  await service.joinLeague(token, 'carol')
  await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 2_000)
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 2_000)
  await service.assignLeagueRosterRequirement(token, 'alice', 'carol', 1_000)
  await saveAndSealLeagueRoster(token, 'alice', 2_000)
  await saveAndSealLeagueRoster(token, 'bob', 2_000)
  await saveAndSealLeagueRoster(token, 'carol', 1_000)

  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)

  await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 1_000)
  await saveAndSealLeagueRoster(token, 'alice', 1_000, '-allied')
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 1_000)
  await saveAndSealLeagueRoster(token, 'bob', 1_000, '-replacement')

  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)

  await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 2_000)
  await saveAndSealLeagueRoster(token, 'alice', 2_000, '-solo')
  await service.revealLeague(token, 'alice')
  expect((await service.league(token, 'alice'))?.revealedAt).not.toBeNull()
})

it('refuses reveal when a frozen roster does not match its event size', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Sized league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await service.joinLeague(token, 'alice')
  await service.joinLeague(token, 'bob')
  await database
    .update(leagueEventEntries)
    .set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Wrong size', 1_000)), rosterName: 'Wrong size', submittedAt: 1 })

  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)
})

it('does not let league edits reduce an open 2v1 event below three places', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 3,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 })

  expect(
    await refusalStatus(() =>
      service.updateLeague(token, 'alice', {
        name: 'Team league',
        description: '',
        visibility: 'private',
        admission: 'automatic',
        playerLimit: 2,
      }),
    ),
  ).toBe(409)
})

it('lets a revealed 2v1 event lower the future player limit', async () => {
  const { token } = await revealedTeamLeague()

  await service.updateLeague(token, 'alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })

  expect(await service.league(token, 'alice')).toEqual(expect.objectContaining({ playerLimit: 2 }))
})

it('links a sealed-roster battle back to its league', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)
  const battleView = await view(battle.token, 'alice')

  expect({ leagueToken: battleView.leagueToken, eventToken: battleView.leagueEventToken }).toEqual({
    leagueToken: league.token,
    eventToken: league.eventToken,
  })
})

it('lists an event battle and gives a non-player a read-only spectator screen', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null, league.eventToken)

  const page = await service.leagueBattles(league.token, league.eventToken, { limit: 25 })
  const screen = await service.screen(battle.token, 'carol')

  expect(page).toEqual(
    expect.objectContaining({
      nextCursor: null,
      battles: [expect.objectContaining({ token: battle.token, players: ['Alice', 'Dave'], armies: ['Alice sealed', 'Dave sealed'] })],
    }),
  )
  expect(screen).toEqual(
    expect.objectContaining({
      kind: 'spectator',
      view: expect.objectContaining({
        leagueToken: league.token,
        leagueEventToken: league.eventToken,
        players: [
          expect.objectContaining({ id: 'alice', isViewer: false, roster: expect.objectContaining({ name: 'Alice sealed' }) }),
          expect.objectContaining({ id: 'dave', isViewer: false, roster: expect.objectContaining({ name: 'Dave sealed' }) }),
        ],
      }),
      report: expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('Alice sealed') })]),
    }),
  )
})

it('keeps league battle history scoped to its event', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed'))
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null, league.eventToken)
  const next = await service.createLeagueEvent(league.token, 'alice', { format: '1v1', rosterLimit: 600 })

  expect((await service.leagueBattles(league.token, league.eventToken, { limit: 25 })).battles.map((entry) => entry.token)).toEqual([
    battle.token,
  ])
  expect((await service.leagueBattles(league.token, next.eventToken, { limit: 25 })).battles).toEqual([])
})

it('converts a persisted one-off league for legacy replicas', async () => {
  const { token, eventToken } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await database.update(leagues).set({ recurring: false }).where(eq(leagues.token, token))

  await service.makeLeagueRecurring(token, 'alice')

  expect((await service.league(token, 'alice', eventToken))?.recurring).toBe(true)
})

it('only lets the organizer convert a persisted one-off league', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await database.update(leagues).set({ recurring: false }).where(eq(leagues.token, token))

  expect(await refusalStatus(() => service.makeLeagueRecurring(token, 'bob'))).toBe(403)
})

it('rechecks the event size when creating a 1v1 league battle', async () => {
  const league = await revealedLeague()
  await database.update(leagueEventEntries).set({ rosterSnapshot: JSON.stringify(leagueSnapshot('Changed snapshot', 1_000)) })

  expect(await refusalStatus(() => service.createLeagueBattle('alice', league.token, 'dave', null))).toBe(409)
})

it('keeps prior event entrants out of a new event', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed'))
  const next = await service.createLeagueEvent(league.token, 'alice', { format: '1v1', rosterLimit: 600 })

  const current = await service.league(league.token, 'dave', next.eventToken)
  const previous = await service.league(league.token, 'dave', league.eventToken)

  expect({
    currentEntries: current?.entries,
    currentNumber: current?.eventNumber,
    currentFormat: current?.format,
    currentLimit: current?.rosterLimit,
    previousEntries: previous?.entries.length,
    previousFormat: previous?.format,
    previousLimit: previous?.rosterLimit,
  }).toEqual({
    currentEntries: [],
    currentNumber: 2,
    currentFormat: '1v1',
    currentLimit: 600,
    previousEntries: 2,
    previousFormat: '1v1',
    previousLimit: 2_000,
  })
})

it('lets a two-player league raise its limit before starting a 2v1 event', async () => {
  const league = await revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed'))
  await service.updateLeague(league.token, 'alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 3,
  })

  const next = await service.createLeagueEvent(league.token, 'alice', { format: '2v1', rosterLimit: 2_000 })

  expect(await service.league(league.token, 'alice', next.eventToken)).toEqual(
    expect.objectContaining({ format: '2v1', playerLimit: 3, rosterLimit: 2_000 }),
  )
})

it('changes an open event rule and drops the assignments made under the old one', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'Team league',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 3,
  })
  await service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 })
  await service.joinLeague(token, 'bob')
  await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 1_000)

  await service.updateLeagueEvent(token, 'alice', { format: '1v1', rosterLimit: 1_000 })

  expect(await service.league(token, 'alice')).toEqual(
    expect.objectContaining({
      format: '1v1',
      rosterLimit: 1_000,
      entries: [expect.objectContaining({ userId: 'bob', requiredLimit: 1_000 })],
    }),
  )
})

it('refuses an event rule the league player limit cannot seat', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })

  expect(await refusalStatus(() => service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 }))).toBe(409)
})

it('refuses an event rule change once an entrant has sealed a roster', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await service.joinLeague(token, 'alice')
  await saveAndSealLeagueRoster(token, 'alice', 2_000)

  expect(await refusalStatus(() => service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 }))).toBe(409)
})

it('only lets the organizer change an event rule', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })

  expect(await refusalStatus(() => service.updateLeagueEvent(token, 'bob', { format: '2v2', rosterLimit: 2_000 }))).toBe(403)
})

it('accepts the organizer into their own league without an approval', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: null,
  })

  await expect(service.joinLeague(token, 'alice')).resolves.toBe('accepted')
})

it('accepts the waiting requests in join order when joining becomes automatic', async () => {
  await enrol('dave', 'Dave')
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: 2,
  })
  for (const userId of ['bob', 'carol', 'dave']) await service.joinLeague(token, userId)

  await service.updateLeague(token, 'alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })

  expect((await service.league(token, 'alice'))?.entries.map((entry) => [entry.userId, entry.status])).toEqual([
    ['bob', 'accepted'],
    ['carol', 'accepted'],
    ['dave', 'pending'],
  ])
})

it('only lets the organizer edit and delete a league', async () => {
  await enrol('dave', 'Dave')
  const league = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: null,
  })
  const update = {
    name: 'Renamed league',
    description: 'New details',
    visibility: 'public' as const,
    admission: 'automatic' as const,
    playerLimit: 4,
  }

  expect(await refusalStatus(() => service.updateLeague(league.token, 'dave', update))).toBe(403)
  await service.updateLeague(league.token, 'alice', update)
  expect(await service.league(league.token, 'alice')).toEqual(expect.objectContaining(update))
  expect(await refusalStatus(() => service.deleteLeague(league.token, 'dave'))).toBe(403)
  await service.deleteLeague(league.token, 'alice')
  expect(await service.league(league.token, 'alice')).toBeNull()
})

it('deletes league history while preserving a battle made from its sealed rosters', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)

  await service.deleteLeague(league.token, 'alice')

  const [screen, events, entries] = await Promise.all([
    view(battle.token, 'alice'),
    database.select().from(leagueEvents),
    database.select().from(leagueEventEntries),
  ])
  expect({ league: await service.league(league.token, 'alice'), events, entries }).toEqual({ league: null, events: [], entries: [] })
  expect(screen.players.map((player) => [player.id, player.roster?.name])).toEqual([
    ['alice', league.aliceRoster.name],
    ['dave', league.opponentRoster.name],
  ])
})

it('refuses to replace a league roster through the battle service', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)
  const screen = await view(battle.token, 'alice')
  const { result } = await service.submit(battle.token, 'alice', screen.seq, {
    kind: 'attach-roster',
    roster: leagueSnapshot('Replacement'),
  })

  expect(result).toEqual({ outcome: 'refused', reason: 'league rosters are sealed' })
})

it('requires sealed 1v1 rosters to use the event size', async () => {
  expect(await refusalStatus(() => revealedLeague(leagueSnapshot('Alice sealed'), leagueSnapshot('Dave sealed', 1_000)))).toBe(409)
})

it('stores a readable league snapshot without the saved roster capability', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
  })
  await service.joinLeague(token, 'bob')
  await service.saveRoster('bob', {
    id: 'bob-roster',
    name: 'Bob army',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const roster = await service.ownRoster('bob', 'bob-roster')
  if (!roster) throw new Error('expected saved roster')
  await service.submitLeagueRoster(token, 'bob', roster, {
    id: 'bob-roster',
    name: 'Bob army',
    text: '2,000 pts',
    built: {
      catalogueId: 'catalogue',
      revision: 'revision',
      limit: 2_000,
      detachment: null,
      disposition: null,
      picks: [],
      units: [{ key: 'unit', entryId: 'unit', name: 'Intercessors', points: 80, models: 5, group: 'character', warlord: true }],
    },
  })
  await service.revealLeague(token, 'alice')

  expect(await service.leagueRoster(token, 'bob')).toEqual({
    name: 'Bob army',
    text: '2,000 pts',
    built: {
      catalogueId: 'catalogue',
      revision: 'revision',
      limit: 2_000,
      detachment: null,
      disposition: null,
      picks: [],
      units: [{ key: 'unit', entryId: 'unit', name: 'Intercessors', points: 80, models: 5, group: 'character', warlord: true }],
    },
  })
})

it('rejects a league snapshot that cannot be read back', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: null,
  })
  await service.joinLeague(token, 'bob')
  await service.saveRoster('bob', {
    id: 'bob-roster',
    name: 'Bob army',
    catalogueId: 'catalogue',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [],
    prep: null,
    visibility: 'private',
    source: 'editable',
  })
  const roster = await service.ownRoster('bob', 'bob-roster')
  if (!roster) throw new Error('expected saved roster')

  await expect(
    service.submitLeagueRoster(token, 'bob', roster, {
      name: 'Bob army',
      text: '2,000 pts',
      built: {
        catalogueId: 'catalogue',
        revision: 'revision',
        limit: 2_000,
        detachment: null,
        disposition: null,
        units: [{ key: 'unit', name: 'x'.repeat(81), points: 80, models: 5 }],
      },
    }),
  ).rejects.toThrow()
  expect(await refusalStatus(() => service.revealLeague(token, 'alice'))).toBe(409)
})

it('lets an entrant seal another roster after the organizer unseals theirs', async () => {
  const { token } = await revealedLeague()

  await service.unsealLeagueRoster(token, 'alice', 'dave')
  await saveAndSealLeagueRoster(token, 'dave', 2_000, '-replacement')

  expect(await service.leagueRoster(token, 'dave')).toMatchObject({ name: 'dave-replacement sealed' })
})

it('withholds an unsealed roster from the revealed event', async () => {
  const { token } = await revealedLeague()

  await service.unsealLeagueRoster(token, 'alice', 'dave')

  expect(await service.leagueRoster(token, 'dave')).toBeNull()
})

describe('an ally reads a sealed roster before the event reveals', () => {
  async function sealedDoublesEvent() {
    await enrol('dave', 'Dave')
    const { token, eventToken } = await service.createLeague('alice', {
      name: 'Doubles league',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: 4,
    })
    await service.updateLeagueEvent(token, 'alice', { format: '2v2', rosterLimit: 2_000 })
    for (const userId of ['alice', 'bob', 'carol', 'dave']) await service.joinLeague(token, userId)
    await service.assignLeagueTeam(token, 'alice', ['alice', 'bob'])
    await service.assignLeagueTeam(token, 'alice', ['carol', 'dave'])
    for (const userId of ['alice', 'bob', 'carol', 'dave']) {
      await saveAndSealLeagueRoster(token, userId, 1_000, '', userId === 'alice' || userId === 'carol')
    }
    return { token, eventToken }
  }

  async function sealedSoloVersusPairEvent() {
    const { token, eventToken } = await service.createLeague('alice', {
      name: 'Team league',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: 3,
    })
    await service.updateLeagueEvent(token, 'alice', { format: '2v1', rosterLimit: 2_000 })
    for (const userId of ['alice', 'bob', 'carol']) await service.joinLeague(token, userId)
    await service.assignLeagueRosterRequirement(token, 'alice', 'alice', 2_000)
    await service.assignLeagueRosterRequirement(token, 'alice', 'bob', 1_000)
    await service.assignLeagueRosterRequirement(token, 'alice', 'carol', 1_000)
    for (const [userId, limit] of [
      ['alice', 2_000],
      ['bob', 1_000],
      ['carol', 1_000],
    ] as const) {
      await saveAndSealLeagueRoster(token, userId, limit)
    }
    return { token, eventToken }
  }

  // Bob organizes nothing, so reading Alice's list is the pairing alone.
  it('gives a doubles entrant the teammate list they must build around', async () => {
    const { token } = await sealedDoublesEvent()

    expect(await service.leagueRoster(token, 'alice', undefined, 'bob')).toMatchObject({ name: 'alice sealed' })
  })

  it('keeps the opposing doubles team sealed until reveal', async () => {
    const { token } = await sealedDoublesEvent()

    expect(await service.leagueRoster(token, 'carol', undefined, 'bob')).toBeNull()
    expect(await service.leagueRoster(token, 'dave', undefined, 'bob')).toBeNull()
  })

  it('follows the pairing when the organizer moves an entrant to another team', async () => {
    const { token } = await sealedDoublesEvent()

    // Re-pairing discards both teams' seals, so Alice seals again beside her new teammate.
    await service.assignLeagueTeam(token, 'alice', ['alice', 'carol'])
    await saveAndSealLeagueRoster(token, 'alice', 1_000, '-repaired')

    expect(await service.leagueRoster(token, 'alice', undefined, 'carol')).toMatchObject({ name: 'alice-repaired sealed' })
    expect(await service.leagueRoster(token, 'alice', undefined, 'bob')).toBeNull()
  })

  it('joins the two 2v1 allies who are forced to play together', async () => {
    const { token } = await sealedSoloVersusPairEvent()

    expect(await service.leagueRoster(token, 'carol', undefined, 'bob')).toMatchObject({ name: 'carol sealed' })
    expect(await service.leagueRoster(token, 'bob', undefined, 'carol')).toMatchObject({ name: 'bob sealed' })
  })

  it('keeps the 2v1 solo list from the pair, and their lists from the solo player', async () => {
    const { token } = await sealedSoloVersusPairEvent()

    expect(await service.leagueRoster(token, 'alice', undefined, 'bob')).toBeNull()
    expect(await service.leagueRoster(token, 'bob', undefined, 'alice')).toBeNull()
  })

  it('gives a 1v1 entrant no early sight of the list they will face', async () => {
    const { token } = await service.createLeague('alice', {
      name: 'League',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: 2,
    })
    await service.joinLeague(token, 'alice')
    await service.joinLeague(token, 'bob')
    await saveAndSealLeagueRoster(token, 'alice', 2_000)
    await saveAndSealLeagueRoster(token, 'bob', 2_000)

    expect(await service.leagueRoster(token, 'bob', undefined, 'alice')).toBeNull()
  })

  it('is closed to the organizer and to a visitor, who are nobody’s ally', async () => {
    const { token } = await sealedDoublesEvent()

    // Alice organizes and plays; she reads Bob because they are paired, not because she runs the event.
    expect(await service.leagueRoster(token, 'carol', undefined, 'alice')).toBeNull()
    expect(await service.leagueRoster(token, 'bob', undefined, null)).toBeNull()
  })

  it('does not hand a submitter back their own sealed list', async () => {
    const { token } = await sealedDoublesEvent()

    expect(await service.leagueRoster(token, 'alice', undefined, 'alice')).toBeNull()
  })

  // Without a named event the read has to pick one, and reveal is no longer what narrows the query.
  it('still reaches the last revealed event once the league has opened another', async () => {
    const league = await revealedLeague()
    const next = await service.createLeagueEvent(league.token, 'alice', { format: '1v1', rosterLimit: 2_000 })
    await service.joinLeague(league.token, 'dave', next.eventToken)
    await saveAndSealLeagueRoster(league.token, 'dave', 2_000, '-event-two')

    expect(await service.leagueRoster(league.token, 'dave')).toMatchObject({ name: 'Dave sealed' })
    expect(await service.leagueRoster(league.token, 'dave', next.eventToken)).toBeNull()
  })

  it('follows the ally to their replacement list', async () => {
    const { token } = await sealedSoloVersusPairEvent()

    await saveAndSealLeagueRoster(token, 'carol', 1_000, '-replacement')

    expect(await service.leagueRoster(token, 'carol', undefined, 'bob')).toMatchObject({ name: 'carol-replacement sealed' })
  })
})

it('keeps a revealed roster sealed against its own owner', async () => {
  const { token } = await revealedLeague()

  expect(await refusalStatus(() => saveAndSealLeagueRoster(token, 'dave', 2_000, '-replacement'))).toBe(409)
})

it('refuses to unseal a roster before the event reveals', async () => {
  const { token } = await service.createLeague('alice', {
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: 2,
  })
  await service.joinLeague(token, 'bob')
  await saveAndSealLeagueRoster(token, 'bob', 2_000)

  expect(await refusalStatus(() => service.unsealLeagueRoster(token, 'alice', 'bob'))).toBe(409)
})

it('only lets the organizer unseal a revealed roster', async () => {
  const { token } = await revealedLeague()

  expect(await refusalStatus(() => service.unsealLeagueRoster(token, 'dave', 'dave'))).toBe(403)
})

it('refuses to unseal an entrant who has no sealed roster', async () => {
  const { token } = await revealedLeague()
  await service.unsealLeagueRoster(token, 'alice', 'dave')

  expect(await refusalStatus(() => service.unsealLeagueRoster(token, 'alice', 'dave'))).toBe(404)
})

it('refuses a league battle against an entrant whose roster is unsealed', async () => {
  const { token } = await revealedLeague()

  await service.unsealLeagueRoster(token, 'alice', 'dave')

  expect(await refusalStatus(() => service.createLeagueBattle('alice', token, 'dave', null))).toBe(403)
})

it('leaves a battle started before an unseal reading its own copy of the roster', async () => {
  const league = await revealedLeague()
  const battle = await service.createLeagueBattle('alice', league.token, 'dave', null)

  await service.unsealLeagueRoster(league.token, 'alice', 'dave')

  const screen = await view(battle.token, 'alice')
  expect(screen.players.map((player) => [player.id, player.roster?.name])).toEqual([
    ['alice', league.aliceRoster.name],
    ['dave', league.opponentRoster.name],
  ])
})

it('holds the doubles Warlord rule when an unsealed teammate seals again', async () => {
  const { token } = await revealedDoublesLeague()

  await service.unsealLeagueRoster(token, 'alice', 'bob')

  expect(await refusalStatus(() => saveAndSealLeagueRoster(token, 'bob', 1_000, '-replacement', true))).toBe(409)
})

it('chooses tactical draws on the server instead of trusting the submitted card', async () => {
  const { token } = await service.createBattle('alice', 'bob')
  let seq = 0
  const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, by, seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send('alice', { kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await send('bob', { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } })
  const first = { key: 'first', name: 'First card' }
  const chosenByClient = { key: 'chosen', name: 'Chosen card' }
  expect(
    (
      await send('alice', {
        kind: 'set-prep',
        stratagems: [],
        secondaries: [],
        secondaryDeck: [first, chosenByClient],
        primary: null,
        secondaryMode: 'tactical',
      })
    ).result.outcome,
  ).toBe('appended')
  expect((await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })).result.outcome).toBe('appended')

  expect((await send('alice', { kind: 'draw-secondary', secondary: chosenByClient })).result.outcome).toBe('appended')

  expect((await view(token, 'alice')).players.find((player) => player.id === 'alice')?.secondaries).toContainEqual(
    expect.objectContaining({ key: 'first' }),
  )
})

it('chooses a complete tactical refill atomically on the server', async () => {
  const { token } = await service.createBattle('alice', { opponentId: 'bob', missionPackId: null })
  let seq = 0
  const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, by, seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send('alice', { kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await send('bob', { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } })
  const cards = [
    { key: 'first', name: 'First card' },
    { key: 'second', name: 'Second card' },
  ]
  await send('alice', { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: cards, primary: null, secondaryMode: 'tactical' })
  await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })

  const clientChoices = [
    { key: 'chosen-first', name: 'Chosen first' },
    { key: 'chosen-second', name: 'Chosen second' },
  ]
  expect((await send('alice', { kind: 'draw-secondaries', secondaries: clientChoices })).result.outcome).toBe('appended')
  const drawn = (await view(token, 'alice')).players.find((player) => player.id === 'alice')?.secondaries
  expect(drawn?.map((card) => card.key).sort()).toEqual(['first', 'second'])
})

it('keeps explicitly selected tactical secondaries', async () => {
  const { token } = await service.createBattle('alice', { opponentId: 'bob', missionPackId: null })
  let seq = 0
  const send = async (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, by, seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send('alice', { kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await send('bob', { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } })
  const cards = [
    { key: 'first', name: 'First card' },
    { key: 'second', name: 'Second card' },
    { key: 'third', name: 'Third card' },
  ]
  await send('alice', { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: cards, primary: null, secondaryMode: 'tactical' })
  await send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })

  const selected = cards.slice(1)
  expect((await send('alice', { kind: 'draw-secondaries', secondaries: selected, selected: true })).result.outcome).toBe('appended')
  const drawn = (await view(token, 'alice')).players.find((player) => player.id === 'alice')?.secondaries
  expect(drawn?.map((card) => card.key)).toEqual(['second', 'third'])
})

it('chooses the New Orders replacement on the server', async () => {
  const { token } = await service.createBattle('alice', { opponentId: 'bob', missionPackId: null })
  let seq = 0
  const send = async (command: Parameters<PraetoriumService['submit']>[3]) => {
    const answer = await service.submit(token, 'alice', seq, command)
    if (answer.result.outcome === 'appended') seq = answer.result.seq
    return answer
  }
  await send({ kind: 'attach-roster', roster: { name: 'Alice army', text: 'Alice army' } })
  await service.submit(token, 'bob', seq, { kind: 'attach-roster', roster: { name: 'Bob army', text: 'Bob army' } }).then((answer) => {
    if (answer.result.outcome === 'appended') seq = answer.result.seq
  })
  const cards = [
    { key: 'first', name: 'First card' },
    { key: 'second', name: 'Second card' },
    { key: 'replacement', name: 'Replacement card' },
  ]
  await send({
    kind: 'set-prep',
    stratagems: [{ key: 'new-orders', name: 'New Orders', cp: 1, limit: 'unlimited', phases: ['command'], turn: 'your-turn' }],
    secondaries: [],
    secondaryDeck: cards,
    primary: null,
    secondaryMode: 'tactical',
  })
  await send({ kind: 'begin-battle', firstPlayerId: 'alice' })
  await send({ kind: 'draw-secondaries', secondaries: cards.slice(0, 2), selected: true })

  const answer = await send({
    kind: 'use-new-orders',
    stratagemKey: 'new-orders',
    secondaryKey: 'first',
    secondary: { key: 'client-choice', name: 'Client choice' },
  })

  expect(answer.result.outcome).toBe('appended')
  const player = answer.screen.kind === 'battle' ? answer.screen.view.players.find((candidate) => candidate.id === 'alice') : undefined
  expect(player?.secondaries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: 'first', status: 'discarded' }),
      expect.objectContaining({ key: 'replacement', status: 'active' }),
    ]),
  )
})
