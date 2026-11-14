import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { PUSH_TOKENS_PER_USER } from '../core/notificationConfig'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)(
  'bounds devices and sends to registered devices regardless of an old account preference',
  async () => {
    const store = new SpacetimeOperator(url!, database!, token!)
    const userId = randomUUID()
    const otherId = randomUUID()
    const devices = Array.from({ length: PUSH_TOKENS_PER_USER + 1 }, (_unused, index) => `ExpoPushToken[${userId}-${index}]`)
    try {
      expect(await store.pushEnabled(userId)).toBe(true)
      for (const [index, device] of devices.entries()) {
        await store.registerPushToken({ userId, token: device, platform: 'ios', now: index + 1 })
      }
      const kept = await store.pushTargets([userId])
      expect(kept).toHaveLength(PUSH_TOKENS_PER_USER)
      expect(kept.some((target) => target.token === devices[0])).toBe(false)
      await store.unregisterPushToken(otherId, devices[1]!)
      expect((await store.pushTargets([userId])).some((target) => target.token === devices[1])).toBe(true)
      await store.setPushEnabled(userId, false, 100)
      expect(await store.pushTargets([userId])).toHaveLength(PUSH_TOKENS_PER_USER)
      await store.setPushEnabled(userId, true, 101)
      await store.registerPushToken({ userId: otherId, token: devices[1]!, platform: 'android', now: 102 })
      expect((await store.pushTargets([userId])).some((target) => target.token === devices[1])).toBe(false)
      expect((await store.pushTargets([otherId])).map((target) => target.token)).toEqual([devices[1]])
    } finally {
      await store.deletePushTokens(devices)
      await store.setPushEnabled(userId, true, 103)
    }
  },
)

it.skipIf(!url || !database || !token)('bounds browsers and moves a browser to the account that registers it last', async () => {
  const store = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const otherId = randomUUID()
  const keys = { p256dh: `B${'a'.repeat(86)}`, auth: 'b'.repeat(22) }
  const endpoints = Array.from(
    { length: PUSH_TOKENS_PER_USER + 1 },
    (_unused, index) => `https://fcm.googleapis.com/fcm/send/${userId}-${index}`,
  )
  try {
    for (const [index, endpoint] of endpoints.entries())
      await store.registerWebPushSubscription({ userId, subscription: { endpoint, ...keys }, now: index + 1 })
    const kept = await store.webPushTargets([userId])
    expect(kept).toHaveLength(PUSH_TOKENS_PER_USER)
    expect(kept.some((target) => target.endpoint === endpoints[0])).toBe(false)
    await store.unregisterWebPushSubscription(otherId, endpoints[1]!)
    expect((await store.webPushTargets([userId])).some((target) => target.endpoint === endpoints[1])).toBe(true)
    await store.registerWebPushSubscription({ userId: otherId, subscription: { endpoint: endpoints[1]!, ...keys }, now: 100 })
    expect((await store.webPushTargets([userId])).some((target) => target.endpoint === endpoints[1])).toBe(false)
    expect(await store.webPushTargets([otherId])).toEqual([{ userId: otherId, endpoint: endpoints[1], ...keys }])
  } finally {
    await store.deleteWebPushSubscriptions(endpoints)
  }
})
