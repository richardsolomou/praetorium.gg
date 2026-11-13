import { expect, it } from 'vitest'
import type { PushMessage } from '../adapters/push'
import { campaignPath, pushNotifier, storingNotifier } from './pushNotifier'

it('tags a notification page that already has a query with its notice kind', () => {
  expect(campaignPath('/tournaments/t?event=e', 'sealed-event-round-paired')).toBe(
    '/tournaments/t?event=e&utm_source=praetorium-app&utm_medium=push&utm_campaign=sealed-event-round-paired',
  )
})

it('carries each recipient’s stored notice into their push, so opening it marks that notice read', async () => {
  const sent: PushMessage[] = []
  const repository = {
    storeNotices: async () => [{ bob: '7' }],
    pushTargets: async () => [{ userId: 'bob', token: 'ExpoPushToken[bob]' }],
    namesByIds: async () => new Map(),
    sealedEventNames: async () => new Map(),
    groupNames: async () => new Map(),
  }
  const delivered = new Promise<void>((resolve) => {
    const push = pushNotifier(repository, {
      send: async (messages) => {
        sent.push(...messages)
        resolve()
      },
    })
    storingNotifier(repository, push).notify([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])
  })
  await delivered
  expect(sent.map(({ noticeId, path }) => ({ noticeId, path }))).toEqual([
    { noticeId: '7', path: '/friends?utm_source=praetorium-app&utm_medium=push&utm_campaign=friend-requested&notice=7' },
  ])
})
