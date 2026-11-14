import { createECDH, createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { encryptPayload, webPushSender, webPushSenderFromEnvironment, type WebPushMessage } from './webPush'

const bytes = (text: string) => Buffer.from(text.replaceAll(/\s/g, ''), 'base64url')

function vapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = privateKey.export({ format: 'jwk' })
  return { publicKey: Buffer.concat([Buffer.from([4]), bytes(jwk.x!), bytes(jwk.y!)]).toString('base64url'), privateKey: jwk.d! }
}

const message = (endpoint: string): WebPushMessage => ({
  to: {
    endpoint,
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  },
  title: 'Friend request',
  body: 'Alice wants to be friends.',
  path: '/friends',
})

function sender(respond: (url: string) => Response) {
  const gone: string[][] = []
  const requests: { url: string; headers: Headers }[] = []
  const keys = vapidKeys()
  const push = webPushSender({
    ...keys,
    subject: 'https://praetorium.gg',
    onGone: (endpoints) => {
      gone.push(endpoints)
    },
    fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString()
      requests.push({ url, headers: new Headers(init?.headers) })
      return respond(url)
    }),
    log: () => undefined,
  })
  return { push, gone, requests, keys }
}

describe('web push sender', () => {
  it('is absent without a VAPID key pair', () => {
    expect(webPushSenderFromEnvironment(() => undefined, { APP_URL: 'https://praetorium.gg' })).toBeNull()
  })

  it('stays off, rather than failing, with a malformed key', () => {
    expect(
      webPushSenderFromEnvironment(() => undefined, {
        APP_URL: 'https://praetorium.gg',
        WEB_PUSH_PUBLIC_KEY: 'short',
        WEB_PUSH_PRIVATE_KEY: 'key',
      }),
    ).toBeNull()
  })

  it('stays off when the private key does not belong to the public one', () => {
    expect(
      webPushSenderFromEnvironment(() => undefined, {
        APP_URL: 'https://praetorium.gg',
        WEB_PUSH_PUBLIC_KEY: vapidKeys().publicKey,
        WEB_PUSH_PRIVATE_KEY: vapidKeys().privateKey,
      }),
    ).toBeNull()
  })

  it('encrypts the RFC 8291 example message to its published body', () => {
    const local = createECDH('prime256v1')
    local.setPrivateKey(bytes('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'))
    const body = encryptPayload(
      bytes('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
      { p256dh: message('').to.p256dh, auth: message('').to.auth },
      local,
      bytes('DGv6ra1nlYgDCS1FRnbzlw'),
    )
    expect(body.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })

  it('signs each request for the push service it goes to', async () => {
    const { push, requests, keys } = sender(() => new Response(null, { status: 201 }))
    await push.send([message('https://fcm.googleapis.com/fcm/send/abc')])
    const [, token, publicKey] = /^vapid t=([^,]+), k=(.+)$/.exec(requests[0]!.headers.get('authorization')!)!
    expect(publicKey).toBe(keys.publicKey)
    const [header, claims, signature] = token!.split('.')
    expect(JSON.parse(bytes(claims!).toString())).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'https://praetorium.gg' })
    const point = bytes(keys.publicKey)
    const key = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
      format: 'jwk',
    })
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, bytes(signature!))).toBe(true)
  })

  it('forgets subscriptions the push service no longer knows', async () => {
    const { push, gone } = sender((url) => new Response(null, { status: url.endsWith('gone') ? 410 : 201 }))
    await push.send([message('https://fcm.googleapis.com/fcm/send/kept'), message('https://fcm.googleapis.com/fcm/send/gone')])
    expect(gone).toEqual([['https://fcm.googleapis.com/fcm/send/gone']])
  })

  it('does not retry a request the push service refuses for good', async () => {
    const { push, requests, gone } = sender(() => new Response(null, { status: 400 }))
    await push.send([message('https://fcm.googleapis.com/fcm/send/abc')])
    expect(requests).toHaveLength(1)
    expect(gone).toEqual([])
  })
})
