import { describe, expect, it } from 'vitest'
import { noticeMessage, noticeRecipients, pushTokenSchema } from './notifications'

describe('notice recipients', () => {
  it('never includes the player who caused the notice', () => {
    expect(
      noticeRecipients({ kind: 'battle-created', actorId: 'alice', recipientIds: ['alice', 'bob'], battleToken: 't', league: false }),
    ).toEqual(['bob'])
  })

  it('names each recipient once', () => {
    expect(
      noticeRecipients({ kind: 'league-revealed', actorId: 'alice', recipientIds: ['bob', 'bob', 'carol'], leagueToken: 'l' }),
    ).toEqual(['bob', 'carol'])
  })
})

describe('notice messages', () => {
  it('links a new battle to its page', () => {
    expect(
      noticeMessage(
        { kind: 'battle-created', actorId: 'alice', recipientIds: ['bob'], battleToken: 'abc', league: false },
        { actor: 'Alice' },
      ),
    ).toEqual({ title: 'New battle', body: 'Alice started a battle with you.', path: '/battles/abc' })
  })

  it('says a battle started from a league is a league battle', () => {
    expect(
      noticeMessage(
        { kind: 'battle-created', actorId: 'alice', recipientIds: ['bob'], battleToken: 'abc', league: true },
        { actor: 'Alice' },
      )?.body,
    ).toBe('Alice started a league battle with you.')
  })

  it('names a deleted player generically rather than dropping the notice', () => {
    expect(noticeMessage({ kind: 'friend-requested', actorId: 'gone', recipientIds: ['bob'] }, {})?.body).toBe(
      'A player wants to be friends.',
    )
  })

  it('links a league notice to the event it is about', () => {
    expect(
      noticeMessage(
        { kind: 'league-roster-unsealed', actorId: 'alice', recipientIds: ['bob'], leagueToken: 'league', eventToken: 'event' },
        { league: 'Autumn league' },
      ),
    ).toEqual({
      title: 'Autumn league',
      body: 'The organizer unsealed your roster. Seal a replacement.',
      path: '/leagues/league?event=event',
    })
  })

  it('drops a league notice whose league no longer exists', () => {
    expect(noticeMessage({ kind: 'league-revealed', actorId: 'alice', recipientIds: ['bob'], leagueToken: 'league' }, {})).toBeNull()
  })
})

describe('push tokens', () => {
  it.each(['ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', 'ExpoPushToken[abc-123_Z]'])('accepts %s', (token) => {
    expect(pushTokenSchema.safeParse(token).success).toBe(true)
  })

  it.each(['', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 'apns-device-token', `ExponentPushToken[${'x'.repeat(300)}]`])(
    'refuses %s',
    (token) => {
      expect(pushTokenSchema.safeParse(token).success).toBe(false)
    },
  )
})
