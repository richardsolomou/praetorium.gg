import { describe, expect, it } from 'vitest'
import { noticeMessage, noticeRecipients, pushTokenSchema } from './notifications'

describe('notice recipients', () => {
  it('never includes the player who caused the notice', () => {
    expect(
      noticeRecipients({ kind: 'battle-created', actorId: 'alice', recipientIds: ['alice', 'bob'], battleToken: 't', sealedEvent: false }),
    ).toEqual(['bob'])
  })

  it('names each recipient once', () => {
    expect(
      noticeRecipients({ kind: 'sealed-event-revealed', actorId: 'alice', recipientIds: ['bob', 'bob', 'carol'], sealedEventToken: 'l' }),
    ).toEqual(['bob', 'carol'])
  })
})

describe('notice messages', () => {
  it('links a new battle to its page', () => {
    expect(
      noticeMessage(
        { kind: 'battle-created', actorId: 'alice', recipientIds: ['bob'], battleToken: 'abc', sealedEvent: false },
        { actor: 'Alice' },
      ),
    ).toEqual({ title: 'New battle', body: 'Alice started a battle with you.', path: '/battles/abc' })
  })

  it('says a battle started from a sealed event is a sealed-roster battle', () => {
    expect(
      noticeMessage(
        { kind: 'battle-created', actorId: 'alice', recipientIds: ['bob'], battleToken: 'abc', sealedEvent: true },
        { actor: 'Alice' },
      )?.body,
    ).toBe('Alice started a sealed-roster battle with you.')
  })

  it('tells a player an organizer added them to seal a list in that event', () => {
    expect(
      noticeMessage(
        { kind: 'sealed-event-entry-added', actorId: 'alice', recipientIds: ['bob'], sealedEventToken: 'tournament', eventToken: 'event' },
        { actor: 'Alice', sealedEvent: 'Group night' },
      ),
    ).toEqual({ title: 'Group night', body: 'Alice added you as a player. Seal your list.', path: '/tournaments/tournament?event=event' })
  })

  it('names a deleted player generically rather than dropping the notice', () => {
    expect(noticeMessage({ kind: 'friend-requested', actorId: 'gone', recipientIds: ['bob'] }, {})?.body).toBe(
      'A player wants to be friends.',
    )
  })

  it('links a sealed event notice to the event it is about', () => {
    expect(
      noticeMessage(
        {
          kind: 'sealed-event-roster-unsealed',
          actorId: 'alice',
          recipientIds: ['bob'],
          sealedEventToken: 'tournament',
          eventToken: 'event',
        },
        { sealedEvent: 'Autumn tournament' },
      ),
    ).toEqual({
      title: 'Autumn tournament',
      body: 'The organizer unsealed your roster. Seal a replacement.',
      path: '/tournaments/tournament?event=event',
    })
  })

  it.each([
    ['sealed-event-entry-requested', 'Alice requested to join. Review their entry.'],
    ['sealed-event-entry-rejected', 'The organizer declined your entry.'],
    ['sealed-event-roster-reseal', 'Your sealed list was cleared after a size or team change. Seal a replacement.'],
  ] as const)('describes %s', (kind, body) => {
    expect(
      noticeMessage(
        { kind, actorId: 'alice', recipientIds: ['bob'], sealedEventToken: 'tournament' },
        { actor: 'Alice', sealedEvent: 'Autumn tournament' },
      )?.body,
    ).toBe(body)
  })

  it('names the round a pairing notice is for', () => {
    expect(
      noticeMessage(
        { kind: 'sealed-event-round-paired', actorId: 'alice', recipientIds: ['bob'], sealedEventToken: 'tournament', round: 2 },
        { sealedEvent: 'Autumn tournament' },
      )?.body,
    ).toBe('Round 2 is paired. See your table.')
  })

  it('drops a sealed event notice whose sealed event no longer exists', () => {
    expect(
      noticeMessage({ kind: 'sealed-event-revealed', actorId: 'alice', recipientIds: ['bob'], sealedEventToken: 'tournament' }, {}),
    ).toBeNull()
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
