import { expect, it, vi } from 'vitest'
import type { PushMessage } from '../adapters/push'
import type { WebPushMessage } from '../adapters/webPush'
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
    webPushTargets: async () => [],
    namesByIds: async () => new Map(),
    sealedEventNames: async () => new Map(),
    groupNames: async () => new Map(),
  }
  const delivered = new Promise<void>((resolve) => {
    const push = pushNotifier(repository, {
      app: {
        send: async (messages) => {
          sent.push(...messages)
          resolve()
        },
      },
      web: null,
    })
    storingNotifier(repository, push).notify([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])
  })
  await delivered
  expect(sent.map(({ noticeId, path }) => ({ noticeId, path }))).toEqual([
    { noticeId: '7', path: '/friends?utm_source=praetorium-app&utm_medium=push&utm_campaign=friend-requested&notice=7' },
  ])
})

it('sends a notice to the recipient’s app devices and browsers, each tagged with how it arrived', async () => {
  const keys = { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) }
  const app: PushMessage[] = []
  const web: WebPushMessage[] = []
  const notifier = pushNotifier(
    {
      pushTargets: async () => [{ userId: 'bob', token: 'ExpoPushToken[bob]' }],
      webPushTargets: async () => [
        { userId: 'bob', endpoint: 'https://fcm.googleapis.com/fcm/send/bob', ...keys },
        { userId: 'carol', endpoint: 'https://fcm.googleapis.com/fcm/send/carol', ...keys },
      ],
      namesByIds: async () => new Map([['alice', { name: 'Alice' }]]) as never,
      sealedEventNames: async () => new Map(),
      groupNames: async () => new Map(),
    },
    {
      app: { send: async (messages) => void app.push(...messages) },
      web: { publicKey: 'key', send: async (messages) => void web.push(...messages) },
    },
  )
  notifier.notify([{ kind: 'friend-requested', actorId: 'alice', recipientIds: ['bob'] }])
  await vi.waitFor(() => expect(web).toHaveLength(1))
  expect(app.map((message) => message.path)).toEqual(['/friends?utm_source=praetorium-app&utm_medium=push&utm_campaign=friend-requested'])
  expect(web).toEqual([
    {
      to: { endpoint: 'https://fcm.googleapis.com/fcm/send/bob', ...keys },
      title: 'Friend request',
      body: 'Alice wants to be friends.',
      path: '/friends?utm_source=praetorium-app&utm_medium=web-push&utm_campaign=friend-requested',
    },
  ])
})
