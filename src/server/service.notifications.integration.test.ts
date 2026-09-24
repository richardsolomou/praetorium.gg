import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { PushMessage } from '../adapters/push'
import { PUSH_TOKENS_PER_USER } from '../core/notifications'
import { Repository } from '../db/repository'
import { practiceOpponents, pushPreferences, pushTokens, user } from '../db/schema'
import { pushNotifier } from './pushNotifier'
import { PraetoriumService } from './service'
import { database, enrol, notices, revealedLeague, saveAndSealLeagueRoster, service } from './serviceTestHarness'

const device = (name: string) => `ExponentPushToken[${name}]`

async function register(userId: string, token = device(userId), at = 1) {
  await new Repository(database).registerPushToken({ userId, token, platform: 'ios', now: at })
}

function recordingDelivery() {
  const sent: PushMessage[] = []
  const notifier = pushNotifier(new Repository(database), {
    send: async (messages) => {
      sent.push(...messages)
    },
  })
  return { sent, notifier }
}

const approvalLeague = () =>
  service.createLeague('alice', { name: 'Autumn league', description: '', visibility: 'private', admission: 'approval', playerLimit: null })

describe('notices raised by writes', () => {
  it('tells the seated players when a battle is created for them', async () => {
    const { token } = await service.createBattle('alice', 'bob')

    expect(notices).toEqual([{ kind: 'battle-created', actorId: 'alice', recipientIds: ['bob'], battleToken: token, league: false }])
  })

  it('raises nothing when a battle is refused', async () => {
    await enrol('dave', 'Dave')
    await service.createBattle('alice', 'dave').catch(() => undefined)

    expect(notices).toEqual([])
  })

  it('tells the addressee about a friend request', async () => {
    await enrol('dave', 'Dave')
    await service.requestFriend('dave', 'bob')

    expect(notices).toEqual([{ kind: 'friend-requested', actorId: 'dave', recipientIds: ['bob'] }])
  })

  it('raises nothing for a friend request that already exists', async () => {
    await service.requestFriend('alice', 'bob').catch(() => undefined)

    expect(notices).toEqual([])
  })

  it('tells the requester their friend request was accepted', async () => {
    await enrol('dave', 'Dave')
    await service.requestFriend('dave', 'bob')
    notices.length = 0

    await service.acceptFriend('bob', 'dave')

    expect(notices).toEqual([{ kind: 'friend-accepted', actorId: 'bob', recipientIds: ['dave'] }])
  })

  it('tells the inviter their friend invite was accepted', async () => {
    await enrol('dave', 'Dave')
    const invite = await service.createFriendInvite('alice')

    await service.acceptFriendInvite('dave', invite.token)

    expect(notices).toEqual([{ kind: 'friend-accepted', actorId: 'dave', recipientIds: ['alice'] }])
  })

  it('tells an entrant the organizer accepted their request', async () => {
    const { token } = await approvalLeague()
    await service.joinLeague(token, 'bob')

    await service.moderateLeagueEntry(token, 'alice', 'bob', 'accepted')

    expect(notices).toEqual([{ kind: 'league-entry-accepted', actorId: 'alice', recipientIds: ['bob'], leagueToken: token }])
  })

  it('does not tell an entrant twice when an accepted entry is accepted again', async () => {
    const { token } = await approvalLeague()
    await service.joinLeague(token, 'bob')
    await service.moderateLeagueEntry(token, 'alice', 'bob', 'accepted')
    notices.length = 0

    await service.moderateLeagueEntry(token, 'alice', 'bob', 'accepted')

    expect(notices).toEqual([])
  })

  it('raises nothing when an entry is rejected', async () => {
    const { token } = await approvalLeague()
    await service.joinLeague(token, 'bob')

    await service.moderateLeagueEntry(token, 'alice', 'bob', 'rejected')

    expect(notices).toEqual([])
  })

  it('tells the waiting entrants that switching to automatic entry accepted them', async () => {
    const { token } = await approvalLeague()
    await service.joinLeague(token, 'bob')
    await service.joinLeague(token, 'carol')

    await service.updateLeague(token, 'alice', {
      name: 'Autumn league',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: null,
    })

    expect(notices).toEqual([{ kind: 'league-entry-accepted', actorId: 'alice', recipientIds: ['bob', 'carol'], leagueToken: token }])
  })

  it('tells every accepted entrant when the event reveals', async () => {
    const { token } = await revealedLeague()

    expect(notices.filter((notice) => notice.kind === 'league-revealed')).toEqual([
      { kind: 'league-revealed', actorId: 'alice', recipientIds: expect.arrayContaining(['alice', 'dave']), leagueToken: token },
    ])
  })

  it('tells an entrant the organizer unsealed their roster', async () => {
    const { token } = await revealedLeague()
    notices.length = 0

    await service.unsealLeagueRoster(token, 'alice', 'dave')

    expect(notices).toEqual([{ kind: 'league-roster-unsealed', actorId: 'alice', recipientIds: ['dave'], leagueToken: token }])
  })

  it('tells the other entrants a league battle was created for them', async () => {
    const { token: leagueToken } = await revealedLeague()
    notices.length = 0

    const { token } = await service.createLeagueBattle('alice', leagueToken, 'dave', null)

    expect(notices).toEqual([
      { kind: 'battle-created', actorId: 'alice', recipientIds: ['alice', 'dave'], battleToken: token, league: true },
    ])
  })

  it('raises nothing when a roster is sealed', async () => {
    const { token } = await service.createLeague('alice', {
      name: 'League',
      description: '',
      visibility: 'private',
      admission: 'automatic',
      playerLimit: null,
    })
    await service.joinLeague(token, 'bob')
    notices.length = 0

    await saveAndSealLeagueRoster(token, 'bob', 2_000)

    expect(notices).toEqual([])
  })
})

describe('push delivery', () => {
  it('sends the recipient a notice naming the player who caused it', async () => {
    await register('bob')
    const { sent, notifier } = recordingDelivery()

    await notifier.deliver([{ kind: 'battle-created', actorId: 'alice', recipientIds: ['bob'], battleToken: 'abc', league: false }])

    expect(sent).toEqual([{ to: device('bob'), title: 'New battle', body: 'Alice started a battle with you.', path: '/battles/abc' }])
  })

  it('sends one message to each of the recipient’s devices', async () => {
    await register('bob', device('phone'))
    await register('bob', device('tablet'))
    const { sent, notifier } = recordingDelivery()

    await notifier.deliver([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])

    expect(sent.map((message) => message.to).toSorted()).toEqual([device('phone'), device('tablet')])
  })

  it('never sends a notice to the player who caused it', async () => {
    await register('alice')
    const { sent, notifier } = recordingDelivery()

    await notifier.deliver([
      { kind: 'battle-created', actorId: 'alice', recipientIds: ['alice', 'bob'], battleToken: 'abc', league: false },
    ])

    expect(sent).toEqual([])
  })

  it('sends nothing to a player who turned notifications off', async () => {
    await register('bob')
    await service.setPushEnabled('bob', false)
    const { sent, notifier } = recordingDelivery()

    await notifier.deliver([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])

    expect(sent).toEqual([])
  })

  it('sends again once a player turns notifications back on', async () => {
    await register('bob')
    await service.setPushEnabled('bob', false)
    await service.setPushEnabled('bob', true)
    const { sent, notifier } = recordingDelivery()

    await notifier.deliver([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])

    expect(sent).toHaveLength(1)
  })

  it('does not call the push service for a player with no device', async () => {
    const send = vi.fn(async () => undefined)
    const notifier = pushNotifier(new Repository(database), { send })

    await notifier.deliver([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])

    expect(send).not.toHaveBeenCalled()
  })

  it('never sends to a practice opponent, even one holding a device', async () => {
    await enrol('sparring', 'Sparring partner')
    await database.insert(practiceOpponents).values({ userId: 'sparring' })
    await register('sparring')
    const { token } = await service.createBattle('alice', 'sparring')
    const { sent, notifier } = recordingDelivery()

    await notifier.deliver([{ kind: 'battle-created', actorId: 'alice', recipientIds: ['sparring'], battleToken: token, league: false }])

    expect(sent).toEqual([])
  })

  it('names the league in a league notice', async () => {
    const { token } = await approvalLeague()
    await register('bob')
    const { sent, notifier } = recordingDelivery()

    await notifier.deliver([{ kind: 'league-entry-accepted', actorId: 'alice', recipientIds: ['bob'], leagueToken: token }])

    expect(sent[0]?.title).toBe('Autumn league')
  })

  it('reports a failed delivery without throwing into the caller', async () => {
    const log = vi.fn()
    const notifier = pushNotifier(
      {
        pushTargets: () => Promise.reject(new Error('database down')),
        namesByIds: async () => new Map(),
        leagueNames: async () => new Map(),
      },
      { send: async () => undefined },
      log,
    )

    expect(() => notifier.notify([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])).not.toThrow()
    await vi.waitFor(() => expect(log).toHaveBeenCalledOnce())
  })

  it('answers the request that caused a notice without waiting for the push service', async () => {
    await register('bob')
    const repository = new Repository(database)
    const hanging = new PraetoriumService(
      repository,
      Date.now,
      { publish: () => {} },
      () => 0,
      pushNotifier(repository, { send: () => new Promise(() => {}) }),
    )

    await expect(hanging.createBattle('alice', 'bob')).resolves.toMatchObject({ practice: false })
  })
})

describe('push devices', () => {
  const tokensOf = async (userId: string) =>
    (await database.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId))).map((row) => row.token)

  it('keeps one row when a device registers again', async () => {
    await register('bob', device('phone'), 1)
    await register('bob', device('phone'), 2)

    expect(await database.select({ lastSeenAt: pushTokens.lastSeenAt }).from(pushTokens)).toEqual([{ lastSeenAt: 2 }])
  })

  it('moves a device to the account that signed in on it', async () => {
    await register('alice', device('shared'))
    await register('bob', device('shared'))

    expect({ alice: await tokensOf('alice'), bob: await tokensOf('bob') }).toEqual({ alice: [], bob: [device('shared')] })
  })

  it('forgets the device seen longest ago beyond the per-account bound', async () => {
    for (let index = 0; index <= PUSH_TOKENS_PER_USER; index += 1) await register('bob', device(`device-${index}`), index + 1)

    const kept = await tokensOf('bob')
    expect({ count: kept.length, oldest: kept.includes(device('device-0')) }).toEqual({ count: PUSH_TOKENS_PER_USER, oldest: false })
  })

  it('leaves another account’s device alone on sign-out', async () => {
    await register('bob', device('phone'))

    await service.unregisterPushDevice('alice', device('phone'))

    expect(await tokensOf('bob')).toEqual([device('phone')])
  })

  it('forgets the signing-out account’s device', async () => {
    await register('bob', device('phone'))

    await service.unregisterPushDevice('bob', device('phone'))

    expect(await tokensOf('bob')).toEqual([])
  })

  it('defaults an account that never answered to notifications on', async () => {
    expect(await service.pushEnabled('bob')).toBe(true)
  })

  it('removes an account’s devices and preference when the account is deleted', async () => {
    await register('bob')
    await service.setPushEnabled('bob', false)

    await database.delete(user).where(eq(user.id, 'bob'))

    expect([await database.select().from(pushTokens), await database.select().from(pushPreferences)]).toEqual([[], []])
  })
})
