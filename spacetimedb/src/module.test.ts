import { ConnectionId, Timestamp } from 'spacetimedb'
import { createModuleTestHarness, TestAuth, TestClock } from 'spacetimedb/server/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The test host stubs environment reads, so the module reads these instead.
const env = vi.hoisted((): Record<string, string> => ({}))
vi.mock('spacetime:sys@2.2', async (original) => ({ ...(await original<object>()), env_get: (key: string) => env[key] ?? null }))

import spacetime, * as module from './index'
import { UNIT_LOADOUT_NAME_MAX_LENGTH, UNIT_LOADOUTS_MAX } from '../../src/core/unitLoadouts'
import { ABILITY_REMINDERS_MAX } from '../../src/core/reminders'
import { LEAGUE_REMINDER_COOLDOWN_MS } from '../../src/core/league'

const ISSUER = 'https://praetorium.gg/api/auth'
const AUDIENCE = 'praetorium'
const NOW = 1_800_000_000
const seconds = (time: number) => new Timestamp(BigInt(time) * 1_000_000n)

let connection = 0n
const signed = (payload: Record<string, unknown>) => TestAuth.fromJwtPayload(JSON.stringify(payload), new ConnectionId(++connection))
const player = (subject: string, payload: Record<string, unknown> = {}) =>
  signed({
    iss: ISSUER,
    sub: subject,
    aud: [AUDIENCE],
    userId: `user-of-${subject}`,
    accessExpiresAt: NOW + 300,
    exp: NOW + 300,
    tokenType: 'spacetime-access',
    ...payload,
  })
const stranger = () => signed({ iss: 'https://elsewhere.example', sub: 'stranger', aud: ['spacetimedb'] })

function harness() {
  const operator = signed({ iss: 'https://spacetime.example', sub: 'operator', aud: ['spacetimedb'] })
  const test = createModuleTestHarness(spacetime, module, { clock: new TestClock(seconds(NOW)) })
  Object.assign(env, {
    AUTH_ISSUER: ISSUER,
    AUTH_AUDIENCE: AUDIENCE,
    OPERATOR_IDENTITY: test.withReducerTx(operator, (ctx) => ctx.sender.toHexString()),
  })
  test.withReducerTx(TestAuth.internal(), (ctx) => module.init(ctx, {}))
  const at = (time: number) => test.clock.set(seconds(time))
  const call = <T>(auth: TestAuth, body: Parameters<typeof test.withReducerTx<T>>[1]) => test.withReducerTx(auth, body)
  const procedure = (auth: TestAuth) => test.procedureContext(auth)
  return { test, operator, at, call, procedure }
}

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key]
})

type Ctx = Parameters<typeof module.init>[0]
type SealedEvent = Parameters<Ctx['db']['sealedEvents']['insert']>[0]

/** A private tournament `league` its `organizer` runs, whose event's token is `event`. */
function insertTournament(ctx: Ctx, event: Partial<SealedEvent> = {}) {
  ctx.db.sealedEvents.insert({
    id: 'event',
    token: 'event',
    format: undefined,
    rosterLimit: undefined,
    allowances: undefined,
    rounds: undefined,
    pointsBudget: undefined,
    playsAt: undefined,
    sealBy: undefined,
    createdAt: 1n,
    revealedAt: undefined,
    revealedBy: undefined,
    soloPoints: undefined,
    allyPoints: undefined,
    remindedAt: undefined,
    ...event,
  })
  ctx.db.tournaments.insert({
    id: 'league',
    token: 'league',
    eventId: 'event',
    ownerId: 'organizer',
    name: 'League',
    description: '',
    visibility: 'private',
    admission: 'automatic',
    playerLimit: undefined,
    createdAt: 1n,
  })
}

describe('sharing a revealed league roster', () => {
  function setup(revealed = true) {
    const host = harness()
    const picks = [{ entryId: 'captain', note: 'Owner-only plan', toggles: { warlord: 1 } }]
    const snapshot = JSON.stringify({
      name: 'League army',
      text: 'The submitted army',
      built: { catalogueId: 'catalogue', revision: 'revision', limit: 1000, detachment: null, disposition: null, picks, units: [] },
    })
    host.call(host.operator, (ctx) => {
      insertTournament(ctx, { format: '1v1', rosterLimit: 1000, revealedAt: revealed ? 10n : undefined, revealedBy: 'organizer' })
      ctx.db.leagueEventEntries.insert({
        key: '["event","entrant"]',
        eventId: 'event',
        userId: 'entrant',
        status: 'accepted',
        joinedAt: 1n,
        rosterId: 'saved',
        rosterName: 'League army',
        rosterSnapshot: snapshot,
        submittedAt: 5n,
        requiredLimit: undefined,
        teamId: undefined,
      })
    })
    const save = (id = 'saved', changes: Record<string, unknown> = {}) =>
      module.saveRoster(host.procedure(host.operator), {
        payload: JSON.stringify({
          id,
          userId: 'entrant',
          name: 'League army',
          automaticName: false,
          catalogueId: 'catalogue',
          detachmentId: '[]',
          disposition: null,
          limit: 1000,
          picks: JSON.stringify(picks),
          prep: '{"reminders":[]}',
          tags: '[]',
          waivedRules: '[]',
          optionalRules: '[]',
          borrowedDetachmentId: null,
          visibility: 'private',
          source: 'editable',
          now: NOW,
          ...changes,
        }),
      })
    save()
    const read = (userId = 'entrant', eventToken = 'event') =>
      JSON.parse(module.leagueRosterSharing(host.procedure(host.operator), { token: 'league', eventToken, userId })) as {
        prompt: boolean
        roster: { id: string; visibility: string } | null
      } | null
    const command = (op: string, extra: Record<string, unknown> = {}) =>
      JSON.parse(
        module.leagueCommand(host.procedure(host.operator), {
          payload: JSON.stringify({
            op,
            token: 'league',
            eventToken: 'event',
            ownerId: 'entrant',
            submittedAt: 5,
            rosterId: 'saved',
            now: NOW + 1,
            ...extra,
          }),
        }),
      ) as unknown
    return { ...host, read, command, save }
  }

  it('offers sharing to an ordinary entrant after reveal', () => {
    expect(setup().read()).toMatchObject({ prompt: true, roster: { id: 'saved', visibility: 'private' } })
  })

  it('does not expose sharing before reveal', () => {
    expect(setup(false).read()).toBeNull()
  })

  it('refuses publication before reveal', () => {
    expect(setup(false).command('share-roster')).toBe('unavailable')
  })

  it('does not expose another entrant’s publication controls', () => {
    expect(setup().read('organizer')).toBeNull()
  })

  it('refuses to publish for someone without an accepted submission', () => {
    expect(setup().command('share-roster', { ownerId: 'organizer' })).toBe('unavailable')
  })

  it('makes the original saved roster public', () => {
    const fixture = setup()
    fixture.command('share-roster')
    expect(fixture.test.db.rosters.id.find('saved')?.visibility).toBe('public')
  })

  it('keeps private notes and preparation untouched on the original saved roster', () => {
    const fixture = setup()
    const before = fixture.test.db.rosters.id.find('saved')!
    fixture.command('share-roster')
    const after = fixture.test.db.rosters.id.find('saved')!
    expect([after.picks, after.prep]).toEqual([before.picks, before.prep])
  })

  it('still asks when only another roster is public', () => {
    const fixture = setup()
    fixture.save('other-copy', { visibility: 'public' })
    expect(fixture.read()).toMatchObject({ prompt: true, roster: { id: 'saved', visibility: 'private' } })
  })

  it('does not ask when the original roster is already public', () => {
    const fixture = setup()
    fixture.save('saved', { visibility: 'public', picks: '[{"entryId":"other"}]' })
    expect(fixture.read()?.prompt).toBe(false)
  })

  it('does not ask about an already public roster kept in the archive', () => {
    const fixture = setup()
    fixture.save('saved', { visibility: 'public' })
    module.setRosterArchived(fixture.procedure(fixture.operator), { id: 'saved', userId: 'entrant', archived: true, now: BigInt(NOW + 2) })
    expect(fixture.read()?.prompt).toBe(false)
  })

  it('does not reuse another account’s public roster', () => {
    const fixture = setup()
    fixture.save('other-copy', { userId: 'other', visibility: 'public' })
    expect(fixture.read()?.prompt).toBe(true)
  })

  it('publishes the original roster with edits made since sealing', () => {
    const fixture = setup()
    fixture.save('saved', { picks: '[{"entryId":"other"}]' })
    fixture.command('share-roster')
    expect(fixture.test.db.rosters.id.find('saved')).toMatchObject({ visibility: 'public', picks: '[{"entryId":"other"}]' })
  })

  it('does not create a copy when publishing', () => {
    const fixture = setup()
    fixture.save('saved', { picks: '[{"entryId":"other"}]' })
    fixture.command('share-roster')
    expect(fixture.test.db.rosters.count()).toBe(1n)
  })

  it('does not offer publication after the original roster is deleted', () => {
    const fixture = setup()
    fixture.call(fixture.operator, (ctx) => ctx.db.rosters.id.delete('saved'))
    expect(fixture.read()).toBeNull()
  })

  it('refuses publication after the original roster is deleted', () => {
    const fixture = setup()
    fixture.call(fixture.operator, (ctx) => ctx.db.rosters.id.delete('saved'))
    expect(fixture.command('share-roster')).toBe('unavailable')
  })

  it('does not publish a roster belonging to another account', () => {
    const fixture = setup()
    fixture.call(fixture.operator, (ctx) => {
      const roster = ctx.db.rosters.id.find('saved')!
      ctx.db.rosters.id.update({ ...roster, userId: 'other' })
    })
    expect(fixture.command('share-roster')).toBe('unavailable')
  })

  it('does not create copies on a repeated publication', () => {
    const fixture = setup()
    fixture.command('share-roster')
    fixture.command('share-roster')
    expect(fixture.test.db.rosters.count()).toBe(1n)
  })

  it('refuses a stale submission after an unseal and replacement', () => {
    const fixture = setup()
    expect(fixture.command('share-roster', { submittedAt: 4 })).toBe('stale')
  })

  it('refuses a different roster ID supplied by the caller', () => {
    const fixture = setup()
    fixture.save('other-copy')
    expect(fixture.command('share-roster', { rosterId: 'other-copy' })).toBe('stale')
  })

  it('persists dismissal on the account without changing roster visibility', () => {
    const fixture = setup()
    fixture.command('dismiss-roster-sharing')
    expect(fixture.read()).toMatchObject({ prompt: false, roster: { visibility: 'private' } })
  })

  it('still permits explicit publication after declining', () => {
    const fixture = setup()
    fixture.command('dismiss-roster-sharing')
    expect(fixture.command('share-roster')).toMatchObject({ roster: { visibility: 'public' } })
  })

  it('deletes sharing preferences with the account', () => {
    const fixture = setup()
    fixture.command('dismiss-roster-sharing')
    fixture.call(fixture.operator, (ctx) => module.deleteUserData(ctx, { userId: 'entrant' }))
    expect(fixture.test.db.leagueRosterSharing.count()).toBe(0n)
  })

  it('deletes event sharing choices with the league', () => {
    const fixture = setup()
    fixture.command('dismiss-roster-sharing')
    fixture.command('delete', { ownerId: 'organizer' })
    expect(fixture.test.db.leagueRosterSharing.count()).toBe(0n)
  })
})

describe('what a league event allows', () => {
  function setup(allowances: string | undefined, format = '1v1') {
    const host = harness()
    host.call(host.operator, (ctx) => {
      insertTournament(ctx, { format, rosterLimit: 2000, allowances })
      for (const userId of ['entrant', 'ally'])
        ctx.db.leagueEventEntries.insert({
          key: JSON.stringify(['event', userId]),
          eventId: 'event',
          userId,
          status: 'accepted',
          joinedAt: 1n,
          rosterId: undefined,
          rosterName: undefined,
          rosterSnapshot: undefined,
          submittedAt: undefined,
          requiredLimit: undefined,
          teamId: format === '2v2' ? 'team' : undefined,
        })
    })
    const command = (payload: Record<string, unknown>) =>
      JSON.parse(
        module.leagueCommand(host.procedure(host.operator), {
          payload: JSON.stringify({ token: 'league', eventToken: 'event', ...payload }),
        }),
      ) as unknown
    /** Seals `userId`'s list built at `limit`, with an optional points total, whose one unit costs `points`. */
    const seal = (
      waivedRules: string[],
      {
        userId = 'entrant',
        limit = 2000,
        pointsBudget,
        points = 80,
      }: { userId?: string; limit?: number; pointsBudget?: number; points?: number } = {},
    ) => {
      module.saveRoster(host.procedure(host.operator), {
        payload: JSON.stringify({
          id: `saved-${userId}`,
          userId,
          name: 'League army',
          automaticName: false,
          catalogueId: 'catalogue',
          detachmentId: '[]',
          disposition: null,
          limit,
          pointsBudget,
          picks: '[]',
          prep: '{"reminders":[]}',
          tags: '[]',
          waivedRules: JSON.stringify(waivedRules),
          optionalRules: '[]',
          borrowedDetachmentId: null,
          visibility: 'private',
          source: 'editable',
          now: NOW,
        }),
      })
      const captain = { key: 'captain', entryId: 'captain', name: 'Captain', models: 1, points, warlord: true, group: 'character' }
      return command({
        op: 'submit',
        ownerId: userId,
        userId,
        rosterId: `saved-${userId}`,
        rosterName: 'League army',
        rosterLimit: limit,
        rosterUpdatedAt: NOW,
        snapshot: JSON.stringify({
          name: 'League army',
          text: 'League army',
          built: {
            catalogueId: 'catalogue',
            revision: 'revision',
            limit,
            pointsBudget,
            detachment: null,
            disposition: null,
            waivedRules,
            units: [captain],
          },
        }),
        now: NOW,
      })
    }
    const update = (rule: Record<string, unknown>) =>
      command({ op: 'update', ownerId: 'organizer', rule: { format, rosterLimit: 2000, ...rule } })
    const event = () => host.call(host.operator, (ctx) => ctx.db.sealedEvents.id.find('event'))
    const entry = () => host.call(host.operator, (ctx) => ctx.db.leagueEventEntries.key.find('["event","entrant"]'))
    const set = (fields: { sealBy?: bigint; pointsBudget?: number; allyPoints?: number }) =>
      host.call(host.operator, (ctx) => ctx.db.sealedEvents.id.update({ ...ctx.db.sealedEvents.id.find('event')!, ...fields }))
    const reveal = (now: number) => command({ op: 'reveal', ownerId: 'organizer', now })
    const remind = (now: number, ownerId = 'organizer') => command({ op: 'remind', ownerId, now })
    return { seal, update, event, entry, set, reveal, remind }
  }

  it('refuses a seal reminder from someone who does not run the event', () => {
    const league = setup('[]')
    expect([league.remind(NOW, 'entrant'), league.event()?.remindedAt]).toEqual(['forbidden', undefined])
  })

  it('leaves a player who sealed after a reminder out of the next one', () => {
    const league = setup('[]')
    league.remind(NOW)
    league.seal([])
    expect(league.remind(NOW + LEAGUE_REMINDER_COOLDOWN_MS)).toEqual({ outcome: 'reminded', recipientIds: ['ally'] })
  })

  it('refuses a list sealed after the roster deadline', () => {
    const league = setup('[]')
    league.set({ sealBy: BigInt(NOW - 1) })
    expect(league.seal([])).toMatchObject({ outcome: 'past-deadline' })
  })

  it('reveals without the entrants who missed the roster deadline', () => {
    const league = setup('[]')
    league.seal([])
    league.set({ sealBy: BigInt(NOW + 1) })
    expect(league.reveal(NOW + 2)).toMatchObject({ outcome: 'revealed', entrantIds: ['entrant'] })
  })

  it('refuses a list built to another points total than the event’s', () => {
    const league = setup('[]')
    league.set({ pointsBudget: 1500 })
    expect(league.seal([])).toMatchObject({ outcome: 'wrong-budget' })
  })

  it('seals a doubles list built smaller than the event’s size, within its points per army', () => {
    const league = setup('[]', '2v2')
    league.set({ allyPoints: 800 })
    expect(league.seal([], { limit: 1000, pointsBudget: 800, points: 800 })).toMatchObject({ outcome: 'sealed' })
  })

  it('refuses a doubles list spending past its points per army', () => {
    const league = setup('[]', '2v2')
    league.set({ allyPoints: 800 })
    expect(league.seal([], { limit: 1000, points: 850 })).toMatchObject({ outcome: 'over-points', points: 800 })
  })

  it('refuses a doubles list built bigger than the event’s size', () => {
    expect(setup('[]', '2v2').seal([], { limit: 3000 })).toMatchObject({ outcome: 'wrong-limit' })
  })

  it('refuses a doubles list saved to another points total than its sealed ally’s', () => {
    const league = setup('[]', '2v2')
    league.seal([], { userId: 'ally', limit: 1000, pointsBudget: 800 })
    expect(league.seal([], { limit: 1000 })).toMatchObject({ outcome: 'ally-mismatch', pointsBudget: 800 })
  })

  it('seals a list with a restriction switched off at an event from before allowances', () => {
    expect(setup(undefined).seal(['points-limit'])).toMatchObject({ outcome: 'sealed' })
  })

  it('refuses a list with a restriction switched off at a strict event', () => {
    expect(setup('[]').seal(['points-limit'])).toMatchObject({ outcome: 'disallowed' })
  })

  it('leaves an older event unrecorded when an update carries no allowances', () => {
    const league = setup(undefined)
    league.update({})
    expect(league.event()?.allowances).toBeUndefined()
  })

  it('keeps doubles pairs when only the allowances change', () => {
    const league = setup('[]', '2v2')
    league.update({ allowances: ['legends'] })
    expect(league.entry()?.teamId).toBe('team')
  })
})

describe('clubs', () => {
  function setup(admission: 'automatic' | 'approval' = 'approval', visibility: 'public' | 'private' = 'private') {
    const host = harness()
    const command = (input: Record<string, unknown>) =>
      JSON.parse(module.clubCommand(host.procedure(host.operator), { payload: JSON.stringify({ token: 'club', ...input }) })) as unknown
    const details = { name: 'Club', description: '', visibility, admission }
    command({ op: 'create', id: 'club-id', ownerId: 'owner', now: NOW, ...details })
    const join = (userId: string) => command({ op: 'join', userId, now: NOW + 1 })
    const member = (userId: string) => (join(userId), command({ op: 'moderate', actorId: 'owner', userId, accept: true }))
    const members = () =>
      (
        JSON.parse(module.clubByToken(host.procedure(host.operator), { token: 'club' })) as {
          members: { userId: string; status: string; role: string }[]
        } | null
      )?.members
    const listed = (userId: string) =>
      (JSON.parse(module.clubsVisibleTo(host.procedure(host.operator), { userId, limit: 10 })) as { club: { token: string } }[]).map(
        (row) => row.club.token,
      )
    return { ...host, command, details, join, member, members, listed }
  }

  it('asks the organizers to approve a join request', () => {
    expect(setup().join('player')).toEqual({ status: 'pending', organizerIds: ['owner'] })
  })

  it('lets a player straight in when anyone may join', () => {
    expect(setup('automatic').join('player')).toEqual({ status: 'accepted', organizerIds: [] })
  })

  it('refuses moderation by a member who does not run the club', () => {
    const club = setup()
    club.member('player')
    club.join('waiting')
    expect(club.command({ op: 'moderate', actorId: 'player', userId: 'waiting', accept: true })).toBe('forbidden')
  })

  it('admits everyone waiting when the club opens to anyone', () => {
    const club = setup()
    club.join('waiting')
    club.command({ op: 'update', actorId: 'owner', ...club.details, admission: 'automatic' })
    expect(club.members()?.find((member) => member.userId === 'waiting')?.status).toBe('accepted')
  })

  it('makes admins only of accepted members', () => {
    const club = setup()
    club.join('waiting')
    expect(club.command({ op: 'set-admins', actorId: 'owner', userIds: ['waiting'] })).toBe('not-members')
  })

  it('stops an admin removing another admin', () => {
    const club = setup()
    club.member('first')
    club.member('second')
    club.command({ op: 'set-admins', actorId: 'owner', userIds: ['first', 'second'] })
    expect(club.command({ op: 'remove', actorId: 'first', userId: 'second' })).toBe('forbidden')
  })

  it('keeps the owner in their own club', () => {
    expect(setup().command({ op: 'leave', userId: 'owner' })).toBe('owner')
  })

  it('lists a private club only to its members', () => {
    const club = setup()
    club.member('player')
    expect([club.listed('player'), club.listed('stranger')]).toEqual([['club'], []])
  })

  it('removes a deleted account’s memberships', () => {
    const club = setup()
    club.member('player')
    club.call(club.operator, (ctx) => module.deleteUserData(ctx, { userId: 'player' }))
    expect(club.members()?.map((member) => member.userId)).toEqual(['owner'])
  })

  it('deletes the clubs a deleted account owns', () => {
    const club = setup()
    club.call(club.operator, (ctx) => module.deleteUserData(ctx, { userId: 'owner' }))
    expect(club.members()).toBeUndefined()
  })
})

describe('club battles', () => {
  function setup(members: string[], initialCommands: unknown[] = []) {
    const host = harness()
    const command = (input: Record<string, unknown>) =>
      module.clubCommand(host.procedure(host.operator), { payload: JSON.stringify({ token: 'club', ...input }) })
    command({
      op: 'create',
      id: 'club-id',
      ownerId: 'creator',
      name: 'Club',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      now: NOW,
    })
    for (const userId of members) command({ op: 'join', userId, now: NOW })
    module.createBattle(host.procedure(host.operator), {
      payload: JSON.stringify({
        id: 'battle',
        token: 'battle-token',
        userId: 'creator',
        allyIds: [],
        opponentIds: ['opponent'],
        initialCommands,
        now: NOW,
      }),
    })
    const submit = (expectedSeq: number, body: Record<string, unknown>) =>
      JSON.parse(
        module.submitBattle(host.procedure(host.operator), {
          battleId: 'battle',
          userId: 'creator',
          expectedSeq,
          body: JSON.stringify(body),
          now: BigInt(NOW),
          externalRefusal: '',
        }),
      ) as { result: { outcome: string; reason?: string } }
    const clubs = () =>
      JSON.parse(module.battleClubs(host.procedure(host.operator), { battleId: 'battle' })) as {
        current: { token: string } | null
        options: { token: string }[]
      }
    return { submit, clubs }
  }

  it('tags a club game started between members from the start', () => {
    expect(setup(['opponent'], [{ kind: 'set-battle-club', clubId: 'club-id' }]).clubs().current?.token).toBe('club')
  })

  it('refuses to start a club game with a player outside the club', () => {
    expect(() => setup([], [{ kind: 'set-battle-club', clubId: 'club-id' }])).toThrow('every player must be a member of the club')
  })

  it('offers a club only when every player is a member', () => {
    expect(setup([]).clubs().options).toEqual([])
  })

  it('refuses a club the opponent is not a member of', () => {
    expect(setup([]).submit(0, { kind: 'set-battle-club', clubId: 'club-id' }).result.reason).toBe(
      'every player must be a member of the club',
    )
  })

  it('counts a tagged battle for its club', () => {
    const battle = setup(['opponent'])
    battle.submit(0, { kind: 'set-battle-club', clubId: 'club-id' })
    expect(battle.clubs().current?.token).toBe('club')
  })

  it('stops counting a battle whose club choice is undone', () => {
    const battle = setup(['opponent'])
    battle.submit(0, { kind: 'set-battle-club', clubId: 'club-id' })
    battle.submit(1, { kind: 'undo', target: 1 })
    expect(battle.clubs().current).toBeNull()
  })
})

describe('leagues becoming clubs', () => {
  function setup() {
    const host = harness()
    const league = (ctx: Ctx, id: string, token: string, clubId?: string) =>
      ctx.db.leagues.insert({
        id,
        token,
        ownerId: 'owner',
        name: clubId ? '' : 'Club night',
        description: '',
        visibility: 'private',
        admission: 'automatic',
        playerLimit: undefined,
        recurring: true,
        createdAt: 1n,
        clubId,
      })
    const event = (ctx: Ctx, leagueId: string, number: number) =>
      ctx.db.leagueEvents.insert({
        id: `event-${number}`,
        token: `event-token-${number}`,
        leagueId,
        number,
        format: '1v1',
        rosterLimit: 1000,
        createdAt: BigInt(number),
        revealedAt: undefined,
        revealedBy: undefined,
        allowances: '[]',
        rounds: undefined,
        pointsBudget: undefined,
        playsAt: undefined,
        sealBy: undefined,
      })
    host.call(host.operator, (ctx) => {
      league(ctx, 'league', 'league-token')
      ctx.db.leagueAdmins.insert({ key: JSON.stringify(['league', 'admin']), leagueId: 'league', userId: 'admin', addedAt: 1n })
      for (const number of [1, 2]) event(ctx, 'league', number)
      for (const [eventId, userId, status] of [
        ['event-1', 'player', 'accepted'],
        ['event-2', 'waiting', 'pending'],
      ] as const)
        ctx.db.leagueEventEntries.insert({
          key: JSON.stringify([eventId, userId]),
          eventId,
          userId,
          status,
          joinedAt: 1n,
          rosterId: undefined,
          rosterName: undefined,
          rosterSnapshot: undefined,
          submittedAt: undefined,
          requiredLimit: undefined,
          teamId: undefined,
        })
    })
    const migrate = () => module.migrateLeaguesToClubs(host.procedure(host.operator), { now: BigInt(NOW) })
    const club = () =>
      JSON.parse(module.clubByToken(host.procedure(host.operator), { token: 'league-token' })) as {
        members: { userId: string; role: string }[]
        games: { token: string }[]
      } | null
    const address = (token: string, eventToken = '') =>
      JSON.parse(module.eventAddress(host.procedure(host.operator), { token, eventToken })) as unknown
    return { ...host, league, event, migrate, club, address }
  }

  it('makes a club of the owner, admins and accepted entrants', () => {
    const fixture = setup()
    fixture.migrate()
    expect(fixture.club()?.members.map((member) => [member.userId, member.role])).toEqual(
      expect.arrayContaining([
        ['owner', 'member'],
        ['admin', 'admin'],
        ['player', 'member'],
      ]),
    )
  })

  it('leaves out entrants who were never let in', () => {
    const fixture = setup()
    fixture.migrate()
    expect(fixture.club()?.members.some((member) => member.userId === 'waiting')).toBe(false)
  })

  it('makes each event one of the club’s games', () => {
    const fixture = setup()
    fixture.migrate()
    expect(fixture.club()?.games.map((game) => game.token)).toEqual(['event-token-2', 'event-token-1'])
  })

  it('empties the retired tables', () => {
    const fixture = setup()
    fixture.migrate()
    expect(
      fixture.call(fixture.operator, (ctx) => [ctx.db.leagues.count(), ctx.db.leagueEvents.count(), ctx.db.leagueAdmins.count()]),
    ).toEqual([0n, 0n, 0n])
  })

  it('sends an old league link to its club', () => {
    const fixture = setup()
    fixture.migrate()
    expect(fixture.address('league-token')).toEqual({ kind: 'club', clubToken: 'league-token' })
  })

  it('sends an old link to one of a league’s events to that game', () => {
    const fixture = setup()
    fixture.migrate()
    expect(fixture.address('league-token', 'event-token-2')).toEqual({
      kind: 'club-game',
      clubToken: 'league-token',
      token: 'event-token-2',
    })
  })

  it('finds nothing left to convert on a second run', () => {
    const fixture = setup()
    fixture.migrate()
    expect([fixture.migrate(), fixture.club()?.games.length]).toEqual([0, 2])
  })

  it('moves the events of a league an earlier migration already made a club', () => {
    const fixture = setup()
    fixture.migrate()
    fixture.call(fixture.operator, (ctx) => {
      fixture.league(ctx, 'later', 'later-token', 'league')
      fixture.event(ctx, 'later', 3)
    })
    fixture.migrate()
    expect(fixture.club()?.games.map((game) => game.token)).toEqual(['event-token-3', 'event-token-2', 'event-token-1'])
  })
})

describe('club games', () => {
  function setup() {
    const host = harness()
    const club = (input: Record<string, unknown>) =>
      JSON.parse(module.clubCommand(host.procedure(host.operator), { payload: JSON.stringify({ token: 'club', ...input }) })) as unknown
    club({
      op: 'create',
      id: 'club-id',
      ownerId: 'owner',
      now: NOW,
      name: 'Club',
      description: '',
      visibility: 'private',
      admission: 'approval',
    })
    club({ op: 'join', userId: 'member', now: NOW })
    club({ op: 'moderate', actorId: 'owner', userId: 'member', accept: true })
    const command = (input: Record<string, unknown>) =>
      JSON.parse(module.leagueCommand(host.procedure(host.operator), { payload: JSON.stringify(input) })) as unknown
    const create = (ownerId: string, extra: Record<string, unknown> = {}) =>
      command({
        op: 'create-club-game',
        eventId: 'game-id',
        eventToken: 'game',
        clubToken: 'club',
        ownerId,
        format: '1v1',
        rosterLimit: 2000,
        now: NOW,
        ...extra,
      })
    const game = (input: Record<string, unknown>) => command({ token: 'game', ...input })
    return { ...host, club, create, game }
  }

  it('starts only for the club’s organizers', () => {
    expect(setup().create('member')).toBe('forbidden')
  })

  it('keeps replaced games in the past even when the replacement is deleted', () => {
    const fixture = setup()
    fixture.create('owner')
    const before = fixture.game({ op: 'join', userId: 'member', now: NOW, memberLimit: 128 })
    fixture.create('owner', { eventId: 'next-id', eventToken: 'next-game' })
    const replaced = fixture.game({ op: 'join', userId: 'member', now: NOW, memberLimit: 128 })
    fixture.game({ token: 'next-game', op: 'delete', ownerId: 'owner' })
    const afterDelete = fixture.game({ op: 'join', userId: 'member', now: NOW, memberLimit: 128 })
    expect([before, replaced, afterDelete]).toEqual(['accepted', 'past', 'past'])
  })

  it('refuses a new battle after midnight even when its request carries an earlier time', () => {
    const fixture = setup()
    const now = Date.parse('2026-10-25T19:00:00Z')
    fixture.at(now / 1000)
    fixture.create('owner', { now, timeZone: 'Asia/Nicosia' })
    const snapshot = JSON.stringify({ name: 'Army', text: '10 Intercessors' })
    fixture.call(fixture.operator, (ctx) => {
      ctx.db.sealedEvents.id.update({ ...ctx.db.sealedEvents.id.find('game-id')!, revealedAt: BigInt(now) })
      for (const [index, userId] of ['owner', 'member'].entries())
        ctx.db.leagueEventEntries.insert({
          key: JSON.stringify(['game-id', userId]),
          eventId: 'game-id',
          userId,
          status: 'accepted',
          joinedAt: BigInt(now + index),
          rosterId: undefined,
          rosterName: 'Army',
          rosterSnapshot: snapshot,
          submittedAt: BigInt(now),
          requiredLimit: undefined,
          teamId: undefined,
        })
    })
    const battle = (id: string) =>
      fixture.game({
        op: 'create-battle',
        ownerId: 'owner',
        userId: 'owner',
        id,
        battleToken: id,
        allyIds: [],
        opponentIds: ['member'],
        initialCommands: [],
        now,
        expectedEntries: ['owner', 'member'].map((userId) => ({ userId, snapshot })),
      })
    const before = battle('before')
    fixture.at(Date.parse('2026-10-25T22:00:00Z') / 1000)
    expect([before, battle('after'), fixture.call(fixture.operator, (ctx) => ctx.db.battles.count())]).toEqual([true, 'past', 1n])
  })

  it('refuses Swiss rounds', () => {
    expect(setup().create('owner', { rounds: 3 })).toBe('forbidden')
  })

  it('seats members on their own sides of a team game, one solo player against a pair', () => {
    const fixture = setup()
    fixture.create('owner', { format: '2v1' })
    const sit = (ownerId: string, side: string | null) => fixture.game({ op: 'set-side', ownerId, side, now: NOW })
    expect([sit('owner', 'solo'), sit('member', 'solo'), sit('member', 'pair'), sit('stranger', 'pair')]).toEqual([
      'updated',
      'full',
      'updated',
      'members-only',
    ])
  })

  it('enters a member who seals a list without joining first', () => {
    const fixture = setup()
    fixture.create('owner')
    module.saveRoster(fixture.procedure(fixture.operator), {
      payload: JSON.stringify({
        id: 'saved',
        userId: 'member',
        name: 'Club army',
        automaticName: false,
        catalogueId: 'catalogue',
        detachmentId: '[]',
        disposition: null,
        limit: 2000,
        picks: '[]',
        prep: '{"reminders":[]}',
        tags: '[]',
        waivedRules: '[]',
        optionalRules: '[]',
        borrowedDetachmentId: null,
        visibility: 'private',
        source: 'editable',
        now: NOW,
      }),
    })
    const captain = { key: 'captain', entryId: 'captain', name: 'Captain', models: 1, points: 80, warlord: true, group: 'character' }
    const built = { catalogueId: 'catalogue', revision: 'revision', limit: 2000, detachment: null, disposition: null, units: [captain] }
    expect(
      fixture.game({
        op: 'submit',
        ownerId: 'member',
        userId: 'member',
        rosterId: 'saved',
        rosterName: 'Club army',
        rosterLimit: 2000,
        rosterUpdatedAt: NOW,
        snapshot: JSON.stringify({ name: 'Club army', text: 'Club army', built }),
        now: NOW,
      }),
    ).toMatchObject({ outcome: 'sealed' })
  })

  it('lets a member straight in, whatever the club’s own admission', () => {
    const fixture = setup()
    fixture.create('owner')
    expect(fixture.game({ op: 'join', userId: 'member', now: NOW, memberLimit: 128 })).toBe('accepted')
  })

  it('keeps out a player who is not a member', () => {
    const fixture = setup()
    fixture.create('owner')
    expect(fixture.game({ op: 'join', userId: 'stranger', now: NOW, memberLimit: 128 })).toBe('members-only')
  })

  it('lets its organizers add only the club’s members', () => {
    const fixture = setup()
    fixture.create('owner')
    expect(fixture.game({ op: 'add', ownerId: 'owner', userIds: ['stranger'], memberLimit: 128, now: NOW })).toBe('not-members')
  })

  it('takes no tournament details', () => {
    const fixture = setup()
    fixture.create('owner')
    const details = { name: 'Named', description: '', visibility: 'public', admission: 'automatic', playerLimit: null }
    expect(fixture.game({ op: 'update', ownerId: 'owner', details })).toBe('forbidden')
  })

  it('goes with its club', () => {
    const fixture = setup()
    fixture.create('owner')
    fixture.game({ op: 'join', userId: 'member', now: NOW, memberLimit: 128 })
    fixture.club({ op: 'delete', actorId: 'owner' })
    expect(
      fixture.call(fixture.operator, (ctx) => [ctx.db.sealedEvents.count(), ctx.db.clubGames.count(), ctx.db.leagueEventEntries.count()]),
    ).toEqual([0n, 0n, 0n])
  })
})

describe('swiss rounds', () => {
  const players = ['a', 'b', 'c', 'd']
  function setup() {
    const host = harness()
    host.call(host.operator, (ctx) => {
      insertTournament(ctx, { format: '1v1', rosterLimit: 2000, revealedAt: 2n, revealedBy: 'organizer', allowances: '[]', rounds: 3 })
      for (const userId of players)
        ctx.db.leagueEventEntries.insert({
          key: JSON.stringify(['event', userId]),
          eventId: 'event',
          userId,
          status: 'accepted',
          joinedAt: 1n,
          rosterId: undefined,
          rosterName: 'Army',
          rosterSnapshot: JSON.stringify({ name: 'Army', text: '10 Intercessors' }),
          submittedAt: 1n,
          requiredLimit: undefined,
          teamId: undefined,
        })
    })
    const command = (input: Record<string, unknown>) =>
      JSON.parse(
        module.leagueCommand(host.procedure(host.operator), {
          payload: JSON.stringify({ token: 'league', eventToken: 'event', ownerId: 'organizer', ...input }),
        }),
      ) as unknown
    const pair = (round: number, pairs: [string, string | null][]) => command({ op: 'pair-round', round, pairs })
    const battle = (userId: string, opponentId: string, pairingKey: string) =>
      command({
        op: 'create-battle',
        ownerId: userId,
        id: `battle-${userId}`,
        battleToken: `battle-token-${userId}`,
        userId,
        allyIds: [],
        opponentIds: [opponentId],
        initialCommands: [],
        now: NOW,
        expectedEntries: [userId, opponentId]
          .toSorted((left, right) => players.indexOf(left) - players.indexOf(right))
          .map((id) => ({ userId: id, snapshot: JSON.stringify({ name: 'Army', text: '10 Intercessors' }) })),
        pairingKey,
      })
    return { pair, battle }
  }
  const table = (round: number, number: number) => JSON.stringify(['event', round, number])

  it('seats every sealed entrant at one table', () => {
    expect(setup().pair(1, [['a', 'b']])).toBe('stale')
  })

  it('plays a table only against the paired opponent', () => {
    const swiss = setup()
    swiss.pair(1, [
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(swiss.battle('a', 'c', table(1, 1))).toBe(false)
  })

  it('waits for every table before pairing the next round', () => {
    const swiss = setup()
    swiss.pair(1, [
      ['a', 'b'],
      ['c', 'd'],
    ])
    swiss.battle('a', 'b', table(1, 1))
    expect(
      swiss.pair(2, [
        ['a', 'c'],
        ['b', 'd'],
      ]),
    ).toBe('not-ready')
  })
})

describe('saved action acknowledgements', () => {
  const saved = JSON.stringify(JSON.stringify({ rosterVisibility: 'private', battleSize: 1000 }))
  const input = () => ({
    id: '00000000-0000-4000-8000-000000000001',
    owner: 'creator',
    fingerprint: 'a'.repeat(64),
    createdAt: NOW * 1_000,
    name: 'set_player_defaults',
    args: ['creator', 'private', 1000, NOW * 1_000],
    reportApplied: true,
  })

  it('identifies the transaction that applied a saved action', () => {
    const { procedure, operator } = harness()
    expect(JSON.parse(module.syncProduct(procedure(operator), { payload: JSON.stringify(input()) }))).toEqual({
      result: saved,
      applied: true,
    })
  })

  it('does not report a replayed receipt as a newly applied action', () => {
    const { procedure, operator } = harness()
    const data = input()
    module.syncProduct(procedure(operator), { payload: JSON.stringify(data) })
    expect(JSON.parse(module.syncProduct(procedure(operator), { payload: JSON.stringify(data) }))).toEqual({
      result: saved,
      applied: false,
    })
  })

  it('preserves the response existing servers expect', () => {
    const { procedure, operator } = harness()
    const data = { ...input(), reportApplied: undefined }
    const first = module.syncProduct(procedure(operator), { payload: JSON.stringify(data) })
    expect([first, module.syncProduct(procedure(operator), { payload: JSON.stringify(data) })]).toEqual([saved, saved])
  })
})

describe('auth configuration', () => {
  it('refuses to initialize a database with an invalid issuer', () => {
    const test = createModuleTestHarness(spacetime, module)
    Object.assign(env, { AUTH_ISSUER: 'http://praetorium.gg/api/auth', AUTH_AUDIENCE: AUDIENCE, OPERATOR_IDENTITY: '00'.repeat(32) })
    expect(() => test.withReducerTx(TestAuth.internal(), (ctx) => module.init(ctx, {}))).toThrow('Invalid auth configuration')
  })

  it('serves an operator procedure to the configured operator', () => {
    const { operator, procedure } = harness()
    expect(module.operatorHealth(procedure(operator), {})).toBe(true)
  })

  it('refuses an operator procedure to anyone else', () => {
    const { procedure } = harness()
    expect(() => module.operatorHealth(procedure(stranger()), {})).toThrow('Operator required')
  })
})

describe('session access', () => {
  it('records a player session until its token expires', () => {
    const { test, call } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    expect(test.db.sessionAccess.subject.find('session-1')).toMatchObject({ userId: 'user-of-session-1', expiresAt: BigInt(NOW + 300) })
  })

  it('refuses a token from another issuer', () => {
    const { call } = harness()
    expect(() => call(player('session-1', { iss: 'https://elsewhere.example/api/auth' }), (ctx) => module.onConnect(ctx, {}))).toThrow(
      'Invalid auth token',
    )
  })

  it('admits a SpacetimeDB guest without a session', () => {
    const { test, call } = harness()
    const claims = { iss: 'https://spacetime.example', sub: 'guest', aud: ['spacetimedb'] }
    const identity = call(signed(claims), (ctx) => ctx.sender.toHexString())
    call(signed({ ...claims, hex_identity: identity }), (ctx) => module.onConnect(ctx, {}))
    expect(test.db.sessionAccess.count()).toBe(0n)
  })

  it('refuses a session that revoked its own access', () => {
    const { call } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    call(player('session-1'), (ctx) => module.revokeOwnAccess(ctx, {}))
    expect(() => call(player('session-1'), (ctx) => module.onConnect(ctx, {}))).toThrow('Invalid auth token')
  })

  it('ends access once the expiry timer runs after the token lapsed', () => {
    const { test, call, at } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    const timer = test.db.accessExpiry.iter().next().value!
    at(NOW + 300)
    call(TestAuth.internal(), (ctx) => module.expireAccess(ctx, { timer }))
    expect(test.db.sessionAccess.subject.find('session-1')).toBeNull()
  })

  it('keeps access a later token renewed when an earlier expiry timer runs', () => {
    const { test, call, at } = harness()
    call(player('session-1'), (ctx) => module.onConnect(ctx, {}))
    const timer = test.db.accessExpiry.iter().next().value!
    at(NOW + 240)
    call(player('session-1', { accessExpiresAt: NOW + 540, exp: NOW + 540 }), (ctx) => module.onConnect(ctx, {}))
    at(NOW + 300)
    call(TestAuth.internal(), (ctx) => module.expireAccess(ctx, { timer }))
    expect(test.db.sessionAccess.subject.find('session-1')?.expiresAt).toBe(BigInt(NOW + 540))
  })
})

describe('public battle feed', () => {
  const feed = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth) =>
    (
      JSON.parse(
        module.battleFeed(procedure(operator), {
          payload: JSON.stringify({
            scope: 'public',
            userId: null,
            viewerId: null,
            withUserId: null,
            leagueToken: null,
            eventToken: null,
            since: null,
            before: null,
            limit: 10,
          }),
        }),
      ) as { battles: { battle: { token: string } }[] }
    ).battles.map((battle) => battle.battle.token)
  it('lists a battle whose only other seat is a guest', () => {
    const { operator, procedure } = harness()
    module.createBattle(procedure(operator), {
      payload: JSON.stringify({
        id: 'battle',
        token: 'battle-token',
        userId: 'creator',
        allyIds: [],
        opponentIds: [],
        guestNames: ['Sam'],
        initialCommands: [],
        now: NOW,
      }),
    })
    expect(feed(procedure, operator)).toEqual(['battle-token'])
  })
})

describe('battle commands', () => {
  const creator = 'creator'
  const create = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth, initialCommands: unknown[] = []) =>
    module.createBattle(procedure(operator), {
      payload: JSON.stringify({
        id: 'battle',
        token: 'battle-token',
        userId: creator,
        allyIds: [],
        opponentIds: ['opponent'],
        initialCommands,
        now: NOW,
      }),
    })
  const submit = (
    procedure: ReturnType<typeof harness>['procedure'],
    operator: TestAuth,
    input: {
      userId?: string
      expectedSeq: number
      externalRefusal?: string
      sync?: { operationId: string; fingerprint: string; at: number; reportApplied?: boolean }
    },
  ) =>
    JSON.parse(
      module.submitBattle(procedure(operator), {
        battleId: 'battle',
        userId: input.userId ?? creator,
        expectedSeq: input.expectedSeq,
        body: JSON.stringify({ kind: 'set-setup-step', step: 1, ...(input.sync ? { $sync: input.sync } : {}) }),
        now: BigInt(NOW),
        externalRefusal: input.externalRefusal ?? '',
      }),
    ) as { result: { outcome: string; reason?: string }; applied?: boolean }

  it('reports the atomic application of a synced command only once', () => {
    const { operator, procedure } = harness()
    create(procedure, operator)
    const input = {
      expectedSeq: 0,
      sync: { operationId: '00000000-0000-4000-8000-000000000001', fingerprint: 'a'.repeat(64), at: NOW, reportApplied: true },
    }
    expect([submit(procedure, operator, input).applied, submit(procedure, operator, input).applied]).toEqual([true, false])
  })

  it.each([undefined, { operationId: '00000000-0000-4000-8000-000000000001', fingerprint: 'a'.repeat(64), at: NOW }])(
    'preserves the legacy command response when no applied report is requested (%j)',
    (sync) => {
      const { operator, procedure } = harness()
      create(procedure, operator)
      expect(submit(procedure, operator, { expectedSeq: 0, sync })).not.toHaveProperty('applied')
    },
  )

  it.each([{ expectedSeq: 1 }, { expectedSeq: 0, externalRefusal: 'private refusal details' }])(
    'does not report a new application when a synced command is refused or stale (%j)',
    (input) => {
      const { test, operator, procedure } = harness()
      create(procedure, operator)
      const result = submit(procedure, operator, {
        ...input,
        sync: { operationId: '00000000-0000-4000-8000-000000000001', fingerprint: 'a'.repeat(64), at: NOW, reportApplied: true },
      })
      expect([result.applied, test.db.commands.count()]).toEqual([false, 0n])
    },
  )

  it('appends a command at the expected sequence', () => {
    const { operator, procedure } = harness()
    create(procedure, operator)
    expect(submit(procedure, operator, { expectedSeq: 0 }).result.outcome).toBe('appended')
  })

  it('answers a command built on an older sequence as stale without appending it', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator)
    submit(procedure, operator, { expectedSeq: 0 })
    expect([submit(procedure, operator, { expectedSeq: 0 }).result.outcome, test.db.commands.count()]).toEqual(['stale', 1n])
  })

  it('refuses a player who is not seated without appending', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator)
    expect([submit(procedure, operator, { userId: 'outsider', expectedSeq: 0 }).result.outcome, test.db.commands.count()]).toEqual([
      'refused',
      0n,
    ])
  })

  it('records nothing when the web server refuses the command', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator)
    expect([
      submit(procedure, operator, { expectedSeq: 0, externalRefusal: 'choose a deployment' }).result.outcome,
      test.db.commands.count(),
    ]).toEqual(['refused', 0n])
  })

  it('creates no battle when its first command is refused', () => {
    const { test, operator, procedure } = harness()
    expect(() => create(procedure, operator, [{ kind: 'begin-battle', firstPlayerId: 'stranger' }])).toThrow()
    expect(test.db.battles.count()).toBe(0n)
  })
})

describe('guest seats', () => {
  const create = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth, seats: Record<string, unknown>) =>
    JSON.parse(
      module.createBattle(procedure(operator), {
        payload: JSON.stringify({
          id: 'battle',
          token: 'battle-token',
          userId: 'host',
          allyIds: [],
          opponentIds: [],
          ...seats,
          now: NOW * 1_000,
        }),
      }),
    ) as { seats: { id: string; side: number; automated: boolean; guestName?: string }[] }
  const publicFeed = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth) =>
    (
      JSON.parse(
        module.battleFeed(procedure(operator), {
          payload: JSON.stringify({
            scope: 'public',
            userId: null,
            viewerId: null,
            withUserId: null,
            leagueToken: null,
            eventToken: null,
            since: null,
            before: null,
            limit: 10,
          }),
        }),
      ) as { battles: { battle: { id: string } }[] }
    ).battles.map((row) => row.battle.id)

  it('seats a guest the host names, played by the table', () => {
    const { operator, procedure } = harness()
    expect(create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] }).seats[1]).toEqual({
      id: 'guest:battle:0',
      side: 1,
      automated: true,
      guestName: 'Alex',
    })
  })

  it('refuses an account seat that claims a guest seat', () => {
    const { operator, procedure } = harness()
    expect(() => create(procedure, operator, { opponentIds: ['guest:other:0'], initialCommands: [] })).toThrow('Invalid battle seats')
  })

  it('keeps no product revisions for a guest', () => {
    const { test, operator, procedure } = harness()
    create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] })
    expect(Array.from(test.db.productRevisions.userId.filter('guest:battle:0'))).toEqual([])
  })

  it('refuses a friendship with a guest', () => {
    const { operator, procedure } = harness()
    create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] })
    expect(() =>
      module.requestFriend(procedure(operator), { requesterId: 'host', addresseeId: 'guest:battle:0', now: BigInt(NOW) }),
    ).toThrow('Invalid friendship')
  })

  it('lists a guest battle publicly', () => {
    const { operator, procedure } = harness()
    create(procedure, operator, { guestNames: ['Alex'], initialCommands: [] })
    expect(publicFeed(procedure, operator)).toEqual(['battle'])
  })
})

describe('guest devices', () => {
  const GUEST = 'guest:battle:0'
  const setup = () => {
    const h = harness()
    module.createBattle(h.procedure(h.operator), {
      payload: JSON.stringify({
        id: 'battle',
        token: 'battle-token',
        userId: 'host',
        allyIds: [],
        opponentIds: [],
        guestNames: ['Alex'],
        initialCommands: [],
        now: NOW * 1_000,
      }),
    })
    const read = <T>(json: string) => JSON.parse(json) as T
    const invite = (seatId = GUEST, replace = false) => {
      const input = { battleId: 'battle', seatId, invite: replace ? 'renewed' : 'first' }
      const procedure = h.procedure(h.operator)
      return read<string>(replace ? module.replaceGuestInvite(procedure, input) : module.guestInvite(procedure, input))
    }
    const join = (code: string, deviceHash = 'a'.repeat(64)) =>
      read<unknown>(module.joinGuestSeat(h.procedure(h.operator), { invite: code, deviceHash, now: BigInt(NOW * 1_000) }))
    const device = () => read<unknown>(module.guestDevice(h.procedure(h.operator), { seatId: GUEST }))
    const seat = () =>
      read<{ seats: { id: string; automated: boolean }[] }>(
        module.battleForOperator(h.procedure(h.operator), { battleId: 'battle' }),
      ).seats.find((one) => one.id === GUEST)
    const finish = () =>
      h.call(TestAuth.internal(), (ctx) => {
        for (const [seq, body] of [
          { kind: 'begin-battle', firstPlayerId: 'host' },
          { kind: 'end-battle', reason: 'conceded', concededBy: GUEST },
        ].entries())
          ctx.db.commands.insert({
            key: JSON.stringify(['battle', seq + 1]),
            battleId: 'battle',
            seq: seq + 1,
            userId: seq ? GUEST : 'host',
            at: BigInt(NOW * 1_000),
            body: JSON.stringify(body),
          })
      })
    const claim = (deviceHash = 'a'.repeat(64), userId = 'newcomer') =>
      read<unknown>(
        module.claimGuestSeat(h.procedure(h.operator), { battleId: 'battle', seatId: GUEST, userId, deviceHash, now: BigInt(NOW * 1_000) }),
      )
    return { ...h, invite, join, device, seat, finish, claim }
  }

  it('keeps one invite per guest seat', () => {
    const { invite } = setup()
    invite()
    expect(invite()).toBe('first')
  })

  it('refuses an invite for a seat that is not a guest', () => {
    const { invite } = setup()
    expect(() => invite('host')).toThrow('Invalid guest seat')
  })

  it('seats the device that opens the invite', () => {
    const { invite, join } = setup()
    expect(join(invite())).toEqual({ battleId: 'battle', token: 'battle-token', seatId: GUEST })
  })

  it('refuses a second device once the guest has joined', () => {
    const { invite, join } = setup()
    const code = invite()
    join(code)
    expect(join(code, 'b'.repeat(64))).toBe('taken')
  })

  it('refuses an invite the host replaced', () => {
    const { invite, join } = setup()
    const code = invite()
    invite(GUEST, true)
    expect(join(code)).toBe('missing')
  })

  it('remembers only the hash of the joined device', () => {
    const { invite, join, device } = setup()
    join(invite())
    expect(device()).toEqual({ battleId: 'battle', token: 'battle-token', deviceHash: 'a'.repeat(64), joinedAt: NOW * 1_000 })
  })

  it('stops the table playing a guest who joined on their own device', () => {
    const { invite, join, seat } = setup()
    join(invite())
    expect(seat()?.automated).toBe(false)
  })

  it('hands the seat back to the table when the host replaces the invite', () => {
    const { invite, join, seat } = setup()
    join(invite())
    invite(GUEST, true)
    expect(seat()?.automated).toBe(true)
  })

  it('forgets guest devices with their battle', () => {
    const { test, invite, join, operator, procedure } = setup()
    join(invite())
    module.deleteBattleForOperator(procedure(operator), { battleId: 'battle' })
    expect(test.db.guestSeats.count()).toBe(0n)
  })

  it('moves a finished battle onto the account that claims the guest seat', () => {
    const { invite, join, finish, claim, operator, procedure } = setup()
    join(invite())
    finish()
    expect(claim()).toBe('claimed')
    const data = JSON.parse(module.battleForOperator(procedure(operator), { battleId: 'battle' })) as {
      seats: { id: string; guestName?: string }[]
      log: { by: string; command: { concededBy?: string } }[]
    }
    expect([data.seats.map((one) => one.id), data.log.at(-1)?.by, data.log.at(-1)?.command.concededBy, data.seats[1]?.guestName]).toEqual([
      ['host', 'newcomer'],
      'newcomer',
      'newcomer',
      undefined,
    ])
  })

  it('refuses a claim from a device that did not join', () => {
    const { invite, join, finish, claim } = setup()
    join(invite())
    finish()
    expect(claim('b'.repeat(64))).toBe('this device is not playing that seat')
  })

  it('refuses a claim before the battle finishes', () => {
    const { invite, join, claim } = setup()
    join(invite())
    expect(claim()).toBe('finish the battle before adding it to your record')
  })

  it('refuses a claim from the host', () => {
    const { invite, join, finish, claim } = setup()
    join(invite())
    finish()
    expect(claim('a'.repeat(64), 'host')).toBe('you already have a seat in this battle')
  })

  it('leaves every logged command as it was written when a guest claims', () => {
    const { test, invite, join, finish, claim } = setup()
    join(invite())
    finish()
    const commands = () => Array.from(test.db.commands.battleId.filter('battle'))
    const written = commands()
    claim()
    expect(commands()).toEqual(written)
  })

  it('names the claimant in their battle feed', () => {
    const { invite, join, finish, claim, operator, procedure } = setup()
    join(invite())
    finish()
    claim()
    const feed = JSON.parse(
      module.battleFeed(procedure(operator), {
        payload: JSON.stringify({
          scope: 'user',
          userId: 'newcomer',
          viewerId: 'newcomer',
          withUserId: null,
          leagueToken: null,
          eventToken: null,
          since: null,
          before: null,
          limit: 10,
        }),
      }),
    ) as { battles: { log: { by: string; command: { concededBy?: string } }[] }[] }
    expect(feed.battles.map(({ log }) => [log.at(-1)?.by, log.at(-1)?.command.concededBy])).toEqual([['newcomer', 'newcomer']])
  })

  it('lets the claimant act as their account when the battle reopens', () => {
    const { invite, join, finish, claim, operator, procedure } = setup()
    join(invite())
    finish()
    claim()
    const submitted = JSON.parse(
      module.submitBattle(procedure(operator), {
        battleId: 'battle',
        userId: 'newcomer',
        expectedSeq: 2,
        body: JSON.stringify({ kind: 'reopen-battle' }),
        now: BigInt(NOW * 1_000),
        externalRefusal: '',
      }),
    ) as { result: { outcome: string } }
    expect(submitted.result.outcome).toBe('appended')
  })

  describe('realtime', () => {
    const HASH = 'a'.repeat(64)
    const device = (hash = HASH, payload: Record<string, unknown> = {}) =>
      player(`guest-device:${hash}`, { userId: GUEST, tokenType: 'spacetime-guest', ...payload })
    const connected = () => {
      const h = setup()
      h.join(h.invite())
      const auth = device()
      h.call(auth, (ctx) => module.onConnect(ctx, {}))
      return { ...h, auth }
    }
    const otherBattle = (h: ReturnType<typeof harness>) =>
      module.createBattle(h.procedure(h.operator), {
        payload: JSON.stringify({
          id: 'other',
          token: 'other-token',
          userId: 'stranger',
          allyIds: [],
          opponentIds: [],
          guestNames: ['Blake'],
          initialCommands: [],
          now: NOW * 1_000,
        }),
      })

    it('admits the device that holds the guest seat as that seat', () => {
      const { test } = connected()
      expect(test.db.sessionAccess.subject.find(`guest-device:${HASH}`)?.userId).toBe(GUEST)
    })

    it('refuses a device that does not hold the seat', () => {
      const { invite, join, call } = setup()
      join(invite())
      expect(() => call(device('b'.repeat(64)), (ctx) => module.onConnect(ctx, {}))).toThrow('Invalid auth token')
    })

    it('refuses a guest token that names an account', () => {
      const { invite, join, call } = setup()
      join(invite())
      expect(() => call(device(HASH, { userId: 'host' }), (ctx) => module.onConnect(ctx, {}))).toThrow('Invalid auth token')
    })

    it('refuses an account token that names a guest seat', () => {
      const { invite, join, call } = setup()
      join(invite())
      expect(() => call(player(`guest-device:${HASH}`, { userId: GUEST }), (ctx) => module.onConnect(ctx, {}))).toThrow(
        'Invalid auth token',
      )
    })

    it('refuses a guest whose session has lapsed', () => {
      const { invite, join, call, at } = setup()
      join(invite())
      const later = NOW + 31 * 24 * 60 * 60
      at(later)
      expect(() => call(device(HASH, { accessExpiresAt: later + 300, exp: later + 300 }), (ctx) => module.onConnect(ctx, {}))).toThrow(
        'Invalid auth token',
      )
    })

    it('signals the guest when their battle moves', () => {
      const { test, call, auth, finish } = connected()
      call(auth, (ctx) => module.watchBattle(ctx, { battleId: 'battle' }))
      finish()
      expect(module.myBattleSignals(test.viewContext(auth))).toEqual([{ battleId: 'battle', seq: 2 }])
    })

    it('refuses to let a guest watch another battle', () => {
      const h = connected()
      otherBattle(h)
      expect(() => h.call(h.auth, (ctx) => module.watchBattle(ctx, { battleId: 'other' }))).toThrow('Battle unavailable')
    })

    it('lists only the guest seat’s own battle', () => {
      const h = connected()
      otherBattle(h)
      expect(module.myBattleList(h.test.viewContext(h.auth))).toEqual([{ battleId: 'battle', seq: 0 }])
    })

    it('gives a guest no account or admin signals', () => {
      const { test, auth } = connected()
      expect([module.myProductSignals(test.viewContext(auth)), module.myAdminSignals(test.viewContext(auth))]).toEqual([[], []])
    })

    it('ends the guest’s realtime session when the host takes the seat back', () => {
      const { test, call, auth, invite } = connected()
      call(auth, (ctx) => module.watchBattle(ctx, { battleId: 'battle' }))
      invite(GUEST, true)
      expect(module.myBattleSignals(test.viewContext(auth))).toEqual([])
    })

    it('ends the guest’s realtime session when they claim the seat', () => {
      const { test, finish, claim } = connected()
      finish()
      claim()
      expect(test.db.sessionAccess.subject.find(`guest-device:${HASH}`)).toBeNull()
    })
  })
})

describe('roster lock', () => {
  const roster = (picks: string) =>
    JSON.stringify({
      id: 'roster',
      userId: 'owner',
      name: 'Finished list',
      automaticName: false,
      catalogueId: 'catalogue-proof',
      detachmentId: '["detachment-proof"]',
      disposition: null,
      limit: 1_000,
      picks,
      prep: null,
      tags: '[]',
      waivedRules: '[]',
      optionalRules: '[]',
      borrowedDetachmentId: null,
      baseRosterId: null,
      visibility: 'private',
      source: 'editable',
      now: NOW,
    })

  it('refuses a content save to a locked roster and keeps its picks', () => {
    const { test, operator, procedure } = harness()
    module.saveRoster(procedure(operator), { payload: roster('[{"entryId":"unit-proof"}]') })
    module.setRosterLocked(procedure(operator), { id: 'roster', userId: 'owner', locked: true, now: BigInt(NOW + 1) })
    expect([module.saveRoster(procedure(operator), { payload: roster('[]') }), test.db.rosters.id.find('roster')?.picks]).toEqual([
      'locked',
      '[{"entryId":"unit-proof"}]',
    ])
  })
})

describe('saved unit loadouts', () => {
  const loadout = (id: string, userId = 'owner', pick: object = { entryId: 'captain', choices: { pistol: 'plasma' } }) => ({
    id,
    userId,
    payload: JSON.stringify({ name: 'Plasma Captain', catalogueId: 'sm', pick }),
    at: BigInt(NOW),
  })
  const saved = (setup: ReturnType<typeof harness>, userId = 'owner') =>
    JSON.parse(module.unitLoadoutsByUser(setup.procedure(setup.operator), { userId })) as { id: string; name: string }[]

  it('lists a saved loadout to its owner', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    expect(saved(setup).map((row) => row.id)).toEqual(['one'])
  })

  it('lists nothing of another player’s loadouts', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    expect(saved(setup, 'other')).toEqual([])
  })

  it('refuses a caller other than the operator', () => {
    const setup = harness()
    expect(() => module.saveUnitLoadout(setup.procedure(stranger()), loadout('one'))).toThrow('Operator required')
  })

  it('refuses a loadout carrying a private note', () => {
    const setup = harness()
    expect(() =>
      module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one', 'owner', { entryId: 'captain', note: 'secret' })),
    ).toThrow('Invalid loadout')
  })

  it('lists a loadout’s joined units back to its owner', () => {
    const setup = harness()
    const joined = [{ entryId: 'lieutenant', attachedTo: 0 }]
    module.saveUnitLoadout(setup.procedure(setup.operator), {
      ...loadout('one'),
      payload: JSON.stringify({ name: 'Command', catalogueId: 'sm', pick: { entryId: 'intercessors' }, joined }),
    })
    expect(saved(setup)).toMatchObject([{ joined }])
  })

  it('refuses a joined unit carrying a private note', () => {
    const setup = harness()
    const payload = JSON.stringify({
      name: 'Command',
      catalogueId: 'sm',
      pick: { entryId: 'intercessors' },
      joined: [{ entryId: 'lieutenant', attachedTo: 0, note: 'secret' }],
    })
    expect(() => module.saveUnitLoadout(setup.procedure(setup.operator), { ...loadout('one'), payload })).toThrow('Invalid loadout')
  })

  it('refuses another loadout once the library is full', () => {
    const setup = harness()
    for (let index = 0; index < UNIT_LOADOUTS_MAX; index++) module.saveUnitLoadout(setup.procedure(setup.operator), loadout(`l-${index}`))
    expect(module.saveUnitLoadout(setup.procedure(setup.operator), loadout('extra'))).toBe('full')
  })

  it('keeps a retried save once', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    expect(saved(setup)).toHaveLength(1)
  })

  it('refuses a save over another player’s loadout ID', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    expect(module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one', 'other'))).toBe('refused')
  })

  it('leaves another player’s loadout when asked to delete it', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    module.deleteUnitLoadout(setup.procedure(setup.operator), { id: 'one', userId: 'other' })
    expect(saved(setup)).toHaveLength(1)
  })

  it('deletes a loadout for its owner', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    module.deleteUnitLoadout(setup.procedure(setup.operator), { id: 'one', userId: 'owner' })
    expect(saved(setup)).toEqual([])
  })

  it('renames a loadout for its owner, keeping its pick and creation time', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    module.renameUnitLoadout(setup.procedure(setup.operator), { id: 'one', userId: 'owner', name: '  Melta Captain  ' })
    expect(saved(setup)).toEqual([
      { id: 'one', name: 'Melta Captain', catalogueId: 'sm', pick: { entryId: 'captain', choices: { pistol: 'plasma' } }, createdAt: NOW },
    ])
  })

  it('leaves another player’s loadout when asked to rename it', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    module.renameUnitLoadout(setup.procedure(setup.operator), { id: 'one', userId: 'other', name: 'Taken' })
    expect(saved(setup)).toMatchObject([{ name: 'Plasma Captain' }])
  })

  it.each(['   ', 'x'.repeat(UNIT_LOADOUT_NAME_MAX_LENGTH + 1)])('refuses a rename to an invalid name', (name) => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    expect(() => module.renameUnitLoadout(setup.procedure(setup.operator), { id: 'one', userId: 'owner', name })).toThrow('Invalid loadout')
  })

  it('deletes loadouts with the account', () => {
    const setup = harness()
    module.saveUnitLoadout(setup.procedure(setup.operator), loadout('one'))
    setup.call(setup.operator, (ctx) => module.deleteUserData(ctx, { userId: 'owner' }))
    expect(setup.test.db.unitLoadouts.id.find('one')).toBeNull()
  })
})

describe('ability reminders', () => {
  const timings = (turn: string) => [{ moment: 'turn-start', phase: null, turn }]
  const reminder = (key = 'datasheet:lightning', turn = 'your-turn') => ({
    key,
    ability: 'Living Lightning',
    description: '',
    timings: timings(turn),
  })
  const save = (setup: ReturnType<typeof harness>, value: object = reminder(), userId = 'owner', at = NOW) =>
    JSON.parse(
      module.saveAbilityReminder(setup.procedure(setup.operator), { userId, payload: JSON.stringify(value), at: BigInt(at) }),
    ) as string
  const listed = (setup: ReturnType<typeof harness>, userId = 'owner') =>
    JSON.parse(module.abilityRemindersByUser(setup.procedure(setup.operator), { userId })) as ReturnType<typeof reminder>[]
  const rosterRow = (id: string, updatedAt: number, reminders: object[]) =>
    JSON.stringify({
      id,
      userId: 'owner',
      name: id,
      automaticName: false,
      catalogueId: 'catalogue-proof',
      detachmentId: '[]',
      disposition: null,
      limit: 1_000,
      picks: '[]',
      prep: JSON.stringify({ stratagems: [], secondaries: [], reminders, remindersEnabled: true }),
      tags: '[]',
      waivedRules: '[]',
      optionalRules: '[]',
      borrowedDetachmentId: null,
      baseRosterId: null,
      visibility: 'private',
      source: 'editable',
      now: updatedAt,
    })
  const unitAlert = (index: number, turn = 'your-turn') => ({
    ...reminder(`datasheet:lightning:${index}`, turn),
    unit: { index, name: 'Plasmancer' },
  })

  it('lists a saved alert to its owner', () => {
    const setup = harness()
    save(setup)
    expect(listed(setup)).toEqual([reminder()])
  })

  it('lists nothing of another player’s alerts', () => {
    const setup = harness()
    save(setup)
    expect(listed(setup, 'other')).toEqual([])
  })

  it('refuses a caller other than the operator', () => {
    const setup = harness()
    expect(() =>
      module.saveAbilityReminder(setup.procedure(stranger()), { userId: 'owner', payload: JSON.stringify(reminder()), at: 1n }),
    ).toThrow('Operator required')
  })

  it('refuses an alert tied to one unit', () => {
    const setup = harness()
    expect(() => save(setup, unitAlert(0))).toThrow('Invalid reminder')
  })

  it('replaces the timings of an ability already set', () => {
    const setup = harness()
    save(setup)
    save(setup, reminder('datasheet:lightning', 'opponent-turn'))
    expect(listed(setup)).toEqual([reminder('datasheet:lightning', 'opponent-turn')])
  })

  it('refuses another ability once the limit is reached', () => {
    const setup = harness()
    for (let index = 0; index < ABILITY_REMINDERS_MAX; index++) save(setup, reminder(`datasheet:${index}`))
    expect(save(setup, reminder('datasheet:extra'))).toBe('full')
  })

  it('deletes an alert for its owner', () => {
    const setup = harness()
    save(setup)
    setup.call(setup.operator, (ctx) => module.deleteAbilityReminder(ctx, { userId: 'owner', key: 'datasheet:lightning' }))
    expect(listed(setup)).toEqual([])
  })

  it('deletes alerts with the account', () => {
    const setup = harness()
    save(setup)
    setup.call(setup.operator, (ctx) => module.deleteUserData(ctx, { userId: 'owner' }))
    expect(setup.test.db.abilityReminders.count()).toBe(0n)
  })

  it('moves an older build’s roster alerts to the account', () => {
    const setup = harness()
    module.saveRoster(setup.procedure(setup.operator), { payload: rosterRow('roster', NOW, [unitAlert(2)]) })
    expect(listed(setup)).toEqual([reminder()])
  })

  it('keeps no alerts in a saved roster', () => {
    const setup = harness()
    module.saveRoster(setup.procedure(setup.operator), { payload: rosterRow('roster', NOW, [unitAlert(2)]) })
    expect(JSON.parse(setup.test.db.rosters.id.find('roster')!.prep!)).not.toHaveProperty('reminders')
  })

  it('keeps an account alert set after the roster was saved', () => {
    const setup = harness()
    save(setup, reminder('datasheet:lightning', 'opponent-turn'), 'owner', NOW + 10)
    module.saveRoster(setup.procedure(setup.operator), { payload: rosterRow('roster', NOW, [unitAlert(2)]) })
    expect(listed(setup)).toEqual([reminder('datasheet:lightning', 'opponent-turn')])
  })

  it('lets a player at the limit change an alert they hold', () => {
    const setup = harness()
    for (let index = 0; index < ABILITY_REMINDERS_MAX; index++) save(setup, reminder(`datasheet:${index}`))
    expect(save(setup, reminder('datasheet:0', 'opponent-turn'))).toBe('saved')
  })

  it('never lets a saved roster replace an alert the account holds', () => {
    const setup = harness()
    save(setup, reminder('datasheet:lightning', 'opponent-turn'), 'owner', NOW - 10)
    module.saveRoster(setup.procedure(setup.operator), { payload: rosterRow('roster', NOW, [unitAlert(2)]) })
    expect(listed(setup)).toEqual([reminder('datasheet:lightning', 'opponent-turn')])
  })

  it('keeps a roster’s alerts the full account could not take', () => {
    const setup = harness()
    for (let index = 0; index < ABILITY_REMINDERS_MAX; index++) save(setup, reminder(`datasheet:${index}`))
    module.saveRoster(setup.procedure(setup.operator), { payload: rosterRow('roster', NOW, [unitAlert(2)]) })
    expect(JSON.parse(setup.test.db.rosters.id.find('roster')!.prep!).reminders).toEqual([unitAlert(2)])
  })

  const stored = (setup: ReturnType<typeof harness>, rosters: readonly (readonly [string, bigint, string])[]) =>
    setup.call(setup.operator, (ctx) => {
      for (const [id, updatedAt, turn] of rosters)
        ctx.db.rosters.insert({
          ...JSON.parse(rosterRow(id, 0, [unitAlert(0, turn)])),
          createdAt: 1n,
          updatedAt,
          detachmentId: '[]',
          disposition: undefined,
          borrowedDetachmentId: undefined,
          automaticName: false,
          locked: false,
          archived: false,
          baseRosterId: undefined,
          copiedFromRosterId: undefined,
          pointsBudget: undefined,
        })
    })

  it('migrates stored rosters, keeping the most recently saved timings', () => {
    const setup = harness()
    stored(setup, [
      ['newer', 9n, 'opponent-turn'],
      ['older', 3n, 'your-turn'],
    ])
    module.migrateProductData(setup.procedure(setup.operator), { table: 'rosters', keys: ['newer', 'older'] })
    expect(listed(setup).map((row) => row.timings)).toEqual([timings('opponent-turn')])
  })

  it('migrates a roster saved at the same time without replacing the alert it found', () => {
    const setup = harness()
    stored(setup, [
      ['first', 5n, 'opponent-turn'],
      ['second', 5n, 'your-turn'],
    ])
    module.migrateProductData(setup.procedure(setup.operator), { table: 'rosters', keys: ['first', 'second'] })
    expect(listed(setup).map((row) => row.timings)).toEqual([timings('opponent-turn')])
  })
})

describe('collection counts', () => {
  const key = JSON.stringify(['owner', 'warriors'])
  const owned = (models: number, built: number, painted: number) => {
    const setup = harness()
    setup.call(setup.operator, (ctx) => module.setCollectionModels(ctx, { userId: 'owner', entryId: 'warriors', models, at: BigInt(NOW) }))
    setup.call(setup.operator, (ctx) => module.setCollectionProgress(ctx, { userId: 'owner', entryId: 'warriors', built, painted }))
    return setup
  }
  const row = ({ test }: ReturnType<typeof harness>) => {
    const found = test.db.collection.key.find(key)
    return { models: found?.models, built: found?.built, painted: found?.painted }
  }
  const imported = (setup: ReturnType<typeof harness>, rows: unknown[], replace = false) =>
    JSON.parse(
      module.importCollection(setup.procedure(setup.operator), { userId: 'owner', rows: JSON.stringify(rows), replace, at: BigInt(NOW) }),
    ) as unknown

  it('keeps built and painted counts', () => {
    expect(row(owned(10, 6, 2))).toEqual({ models: 10, built: 6, painted: 2 })
  })

  it('lowers built and painted counts above what is owned', () => {
    expect(row(owned(10, 20, 15))).toEqual({ models: 10, built: 10, painted: 10 })
  })

  it('lowers built and painted counts when fewer models are owned', () => {
    const setup = owned(10, 8, 5)
    setup.call(setup.operator, (ctx) =>
      module.setCollectionModels(ctx, { userId: 'owner', entryId: 'warriors', models: 4, at: BigInt(NOW) }),
    )
    expect(row(setup)).toEqual({ models: 4, built: 4, painted: 4 })
  })

  it('refuses progress for a datasheet that is not in the collection', () => {
    const { call, operator } = harness()
    expect(() =>
      call(operator, (ctx) => module.setCollectionProgress(ctx, { userId: 'owner', entryId: 'warriors', built: 1, painted: 0 })),
    ).toThrow('Add this datasheet')
  })

  it('removes a wish set to zero', () => {
    const { test, call, operator } = harness()
    call(operator, (ctx) => module.setCollectionWanted(ctx, { userId: 'owner', entryId: 'warriors', wanted: 5, at: BigInt(NOW) }))
    call(operator, (ctx) => module.setCollectionWanted(ctx, { userId: 'owner', entryId: 'warriors', wanted: 0, at: BigInt(NOW) }))
    expect(test.db.collectionWishes.key.find(key)).toBeNull()
  })

  it('imports a datasheet the collection lacks', () => {
    const setup = harness()
    imported(setup, [{ entryId: 'warriors', models: 10, built: 4, painted: 1, wanted: 0 }])
    expect(row(setup)).toEqual({ models: 10, built: 4, painted: 1 })
  })

  it('keeps saved counts an import differs from', () => {
    const setup = owned(10, 6, 2)
    expect([imported(setup, [{ entryId: 'warriors', models: 20, built: 0, painted: 0, wanted: 3 }]), row(setup)]).toEqual([
      { added: 1, replaced: 0, kept: 1 },
      { models: 10, built: 6, painted: 2 },
    ])
  })

  it('adds a wish beside identical owned counts without keeping anything', () => {
    const setup = owned(10, 6, 2)
    expect(imported(setup, [{ entryId: 'warriors', models: 10, built: 6, painted: 2, wanted: 3 }])).toEqual({
      added: 1,
      replaced: 0,
      kept: 0,
    })
  })

  it('replaces saved counts when asked', () => {
    const setup = owned(10, 6, 2)
    imported(setup, [{ entryId: 'warriors', models: 20, built: 0, painted: 0, wanted: 0 }], true)
    expect(row(setup)).toEqual({ models: 20, built: 0, painted: 0 })
  })

  it('refuses an import that lists a datasheet twice', () => {
    const setup = harness()
    const rows = [{ entryId: 'warriors', models: 1, built: 0, painted: 0, wanted: 0 }]
    expect(() => imported(setup, [...rows, ...rows])).toThrow()
  })

  const linked = (setup: ReturnType<typeof harness>, countsAs: string[]) =>
    setup.call(setup.operator, (ctx) => module.setCollectionCountsAs(ctx, { userId: 'owner', entryId: 'warriors', countsAs }))
  const links = ({ test }: ReturnType<typeof harness>) => test.db.collection.key.find(key)?.countsAs

  it('saves what the models also count as without repeats or the datasheet itself', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['immortals', 'warriors', 'deathmarks', 'immortals'])
    expect(links(setup)).toEqual(['deathmarks', 'immortals'])
  })

  it('clears links set to none', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['immortals'])
    linked(setup, [])
    expect(links(setup)).toBeUndefined()
  })

  it('refuses links for a datasheet that is not in the collection', () => {
    expect(() => linked(harness(), ['immortals'])).toThrow('Add this datasheet')
  })

  it('refuses more links than a datasheet holds', () => {
    expect(() =>
      linked(
        owned(2, 0, 0),
        Array.from({ length: 33 }, (_, index) => `sheet-${index}`),
      ),
    ).toThrow()
  })

  it('keeps links when the count changes', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['immortals'])
    setup.call(setup.operator, (ctx) =>
      module.setCollectionModels(ctx, { userId: 'owner', entryId: 'warriors', models: 3, at: BigInt(NOW) }),
    )
    expect(links(setup)).toEqual(['immortals'])
  })

  it('imports links with a new datasheet', () => {
    const setup = harness()
    imported(setup, [{ entryId: 'warriors', models: 2, built: 0, painted: 0, wanted: 0, countsAs: ['immortals'] }])
    expect(links(setup)).toEqual(['immortals'])
  })

  it('adds imported links to a datasheet without any', () => {
    const setup = owned(2, 0, 0)
    expect([
      imported(setup, [{ entryId: 'warriors', models: 2, built: 0, painted: 0, wanted: 0, countsAs: ['immortals'] }]),
      links(setup),
    ]).toEqual([{ added: 1, replaced: 0, kept: 0 }, ['immortals']])
  })

  it('keeps saved links an import differs from', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['deathmarks'])
    expect([
      imported(setup, [{ entryId: 'warriors', models: 2, built: 0, painted: 0, wanted: 0, countsAs: ['immortals'] }]),
      links(setup),
    ]).toEqual([{ added: 0, replaced: 0, kept: 1 }, ['deathmarks']])
  })

  const PHOTO = '00000000-0000-4000-8000-000000000001'
  const photoAs = (setup: ReturnType<typeof harness>, shows: string) =>
    setup.call(setup.operator, (ctx) =>
      module.setCollectionPhotoAs(ctx, { userId: 'owner', entryId: 'warriors', shows, photoId: PHOTO, at: BigInt(NOW) }),
    )

  it('files a photo under a datasheet the models count as', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['immortals'])
    photoAs(setup, 'immortals')
    expect(
      JSON.parse(module.datasheetPhotos(setup.procedure(setup.operator), { entryId: 'immortals', viewerId: undefined, limit: 10 })),
    ).toMatchObject([{ photoId: PHOTO }])
  })

  it('keeps a variant photo with the row it belongs to', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['immortals'])
    photoAs(setup, 'immortals')
    expect(JSON.parse(module.collectionByUser(setup.procedure(setup.operator), { userId: 'owner' }))).toMatchObject([
      { entryId: 'warriors', photoIds: [PHOTO], photoShows: { [PHOTO]: 'immortals' } },
    ])
  })

  it('refuses a photo of a datasheet the models do not count as', () => {
    expect(() => photoAs(owned(2, 0, 0), 'immortals')).toThrow('Choose a datasheet')
  })

  it('replaces saved links when asked', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['deathmarks'])
    imported(setup, [{ entryId: 'warriors', models: 2, built: 0, painted: 0, wanted: 0, countsAs: ['immortals'] }], true)
    expect(links(setup)).toEqual(['immortals'])
  })

  it('keeps saved links when an import lists none', () => {
    const setup = owned(2, 0, 0)
    linked(setup, ['deathmarks'])
    imported(setup, [{ entryId: 'warriors', models: 4, built: 0, painted: 0, wanted: 0 }], true)
    expect(links(setup)).toEqual(['deathmarks'])
  })

  it('deletes wishes with the account', () => {
    const { test, call, operator } = harness()
    call(operator, (ctx) => module.setCollectionWanted(ctx, { userId: 'owner', entryId: 'warriors', wanted: 5, at: BigInt(NOW) }))
    call(operator, (ctx) => module.deleteUserData(ctx, { userId: 'owner' }))
    expect(test.db.collectionWishes.key.find(key)).toBeNull()
  })
})

describe('roster discovery', () => {
  const save = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth, id: string, userId: string) =>
    module.saveRoster(procedure(operator), {
      payload: JSON.stringify({
        id,
        userId,
        name: id,
        automaticName: false,
        catalogueId: 'catalogue-proof',
        detachmentId: '["detachment-proof"]',
        disposition: null,
        limit: 1_000,
        picks: '[]',
        prep: null,
        tags: '[]',
        waivedRules: '[]',
        optionalRules: '[]',
        borrowedDetachmentId: null,
        baseRosterId: null,
        visibility: 'public',
        source: 'editable',
        now: NOW,
      }),
    })
  const friendsPage = (procedure: ReturnType<typeof harness>['procedure'], operator: TestAuth) =>
    (
      JSON.parse(
        module.discoverRosters(procedure(operator), {
          payload: JSON.stringify({
            audience: 'friends',
            viewerId: 'viewer',
            catalogueIds: null,
            detachmentIds: null,
            before: null,
            limit: 10,
          }),
        }),
      ) as { rows: { id: string }[] }
    ).rows.map((row) => row.id)

  it('lists only accepted friends to the friends audience', () => {
    const { operator, procedure } = harness()
    save(procedure, operator, 'friend-list', 'friend')
    save(procedure, operator, 'pending-list', 'pending')
    save(procedure, operator, 'stranger-list', 'stranger')
    module.requestFriend(procedure(operator), { requesterId: 'viewer', addresseeId: 'friend', now: BigInt(NOW) })
    module.acceptFriend(procedure(operator), { requesterId: 'viewer', addresseeId: 'friend', now: BigInt(NOW) })
    module.requestFriend(procedure(operator), { requesterId: 'pending', addresseeId: 'viewer', now: BigInt(NOW) })
    expect(friendsPage(procedure, operator)).toEqual(['friend-list'])
  })
})

describe('recent matchups', () => {
  const remember = (setup: ReturnType<typeof harness>, pairing: string, at: number, shared = `link-${pairing}`) =>
    setup.call(setup.operator, (ctx) =>
      module.rememberMatchup(ctx, {
        userId: 'owner',
        pairing,
        shared,
        attacker: 'Intercessor Squad',
        defender: 'Necron Warriors',
        at: BigInt(at),
      }),
    )
  const recent = (setup: ReturnType<typeof harness>) =>
    (JSON.parse(module.recentMatchupsByUser(setup.procedure(setup.operator), { userId: 'owner' })) as { shared: string }[]).map(
      (entry) => entry.shared,
    )

  it('lists pairings newest first', () => {
    const setup = harness()
    remember(setup, 'a', 1)
    remember(setup, 'b', 2)
    expect(recent(setup)).toEqual(['link-b', 'link-a'])
  })

  it('replaces a pairing with its latest settings', () => {
    const setup = harness()
    remember(setup, 'a', 1)
    remember(setup, 'b', 2)
    remember(setup, 'a', 3, 'edited')
    expect(recent(setup)).toEqual(['edited', 'link-b'])
  })

  it('keeps only the six latest pairings', () => {
    const setup = harness()
    for (let index = 0; index < 7; index += 1) remember(setup, String(index), index)
    expect(recent(setup)).toEqual(['6', '5', '4', '3', '2', '1'].map((pairing) => `link-${pairing}`))
  })

  it('forgets a pairing', () => {
    const setup = harness()
    remember(setup, 'a', 1)
    remember(setup, 'b', 2)
    setup.call(setup.operator, (ctx) => module.forgetMatchup(ctx, { userId: 'owner', pairing: 'a' }))
    expect(recent(setup)).toEqual(['link-b'])
  })

  it('refuses a matchup from anyone but the operator', () => {
    const setup = harness()
    expect(() =>
      setup.call(player('owner'), (ctx) =>
        module.rememberMatchup(ctx, { userId: 'owner', pairing: 'a', shared: 'link', attacker: 'a', defender: 'b', at: 1n }),
      ),
    ).toThrow()
  })

  it('forgets every pairing with the account', () => {
    const setup = harness()
    remember(setup, 'a', 1)
    setup.call(setup.operator, (ctx) => module.deleteUserData(ctx, { userId: 'owner' }))
    expect(recent(setup)).toEqual([])
  })
})

describe('administrator photo list', () => {
  const photo = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  function setup() {
    const host = harness()
    host.call(host.operator, (ctx) => {
      const insert = (index: number, userId: string, at: bigint, review?: string) =>
        ctx.db.collectionPhotos.insert({ photoId: photo(index), key: 'private', userId, entryId: 'warriors', at, likes: 0, review })
      insert(1, 'owner', 1n)
      insert(2, 'owner', 2n)
      insert(3, 'owner', 2n)
      insert(4, 'other', 3n)
      insert(5, 'owner', 4n, 'held')
      insert(6, 'owner', 5n, 'flagged')
      insert(7, 'owner', 6n, 'kept')
    })
    return host
  }
  type Page = { photos: { photoId: string; kept: boolean }[]; nextCursor: { at: number; id: string } | null }
  const list = (host: ReturnType<typeof setup>, input: object) =>
    JSON.parse(
      module.adminCollectionPhotos(host.procedure(host.operator), {
        payload: JSON.stringify({ before: null, limit: 100, ...input }),
      }),
    ) as Page
  const ids = (page: Page) => page.photos.map((row) => row.photoId)

  it('lists photos awaiting no review, newest first', () => {
    expect(ids(list(setup(), {}))).toEqual([photo(7), photo(4), photo(3), photo(2), photo(1)])
  })

  it('continues after a page that ends between photos uploaded at the same moment', () => {
    const host = setup()
    const first = list(host, { limit: 3 })
    expect([ids(first), ids(list(host, { before: first.nextCursor }))]).toEqual([
      [photo(7), photo(4), photo(3)],
      [photo(2), photo(1)],
    ])
  })

  it('says which photos an administrator kept before', () => {
    expect(list(setup(), {}).photos.map((row) => row.kept)).toEqual([true, false, false, false, false])
  })

  it('ends without a cursor on the last page', () => {
    expect(list(setup(), { limit: 5 }).nextCursor).toBeNull()
  })

  it('keeps the list private to the operator', () => {
    const host = setup()
    expect(() =>
      module.adminCollectionPhotos(host.procedure(player('reader')), {
        payload: JSON.stringify({ before: null, limit: 1 }),
      }),
    ).toThrow('Operator required')
  })
})

describe('collection photo thumbnail inventory', () => {
  function setup() {
    const host = harness()
    const ids = Array.from({ length: 102 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
    host.call(host.operator, (ctx) => {
      for (const photoId of ids.toReversed())
        ctx.db.collectionPhotos.insert({ photoId, key: 'private', userId: 'owner', entryId: 'warriors', at: 1n, likes: 0, review: 'held' })
    })
    return { ...host, ids }
  }

  it('includes held photos in stable pages capped at one hundred', () => {
    const host = setup()
    expect(JSON.parse(module.collectionPhotoIds(host.procedure(host.operator), { after: undefined, limit: 1000 }))).toEqual(
      host.ids.slice(0, 100),
    )
  })

  it('continues after the previous page without repeating its last photo', () => {
    const host = setup()
    expect(JSON.parse(module.collectionPhotoIds(host.procedure(host.operator), { after: host.ids[99], limit: 100 }))).toEqual(
      host.ids.slice(100),
    )
  })

  it('keeps the inventory private to the operator', () => {
    const host = setup()
    expect(() => module.collectionPhotoIds(host.procedure(player('reader')), { after: undefined, limit: 100 })).toThrow('Operator required')
  })

  it('queues an unregistered photo once so failed upload cleanup can retry', () => {
    const host = setup()
    const photoId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    for (let attempt = 0; attempt < 2; attempt++) host.call(host.operator, (ctx) => module.queueCollectionPhotoDeletion(ctx, { photoId }))
    expect(JSON.parse(module.collectionPhotoDeletions(host.procedure(host.operator), { limit: 100 }))).toEqual([photoId])
  })

  it('keeps live photos out of the cleanup queue', () => {
    const host = setup()
    host.call(host.operator, (ctx) => module.queueCollectionPhotoDeletion(ctx, { photoId: host.ids[0]! }))
    expect(JSON.parse(module.collectionPhotoDeletions(host.procedure(host.operator), { limit: 100 }))).toEqual([])
  })

  it('requires the operator to queue orphan cleanup', () => {
    const host = setup()
    expect(() => host.call(player('reader'), (ctx) => module.queueCollectionPhotoDeletion(ctx, { photoId: host.ids[0]! }))).toThrow(
      'Operator required',
    )
  })
})
