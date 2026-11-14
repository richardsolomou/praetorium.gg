/**
 * Delivery straight to a browser's push service (Web Push, RFC 8030), signed with
 * this instance's VAPID key (RFC 8292) and encrypted for the subscription (RFC 8291).
 *
 * Like the Expo sender, nothing here throws into its caller: a notice is a courtesy.
 */
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type ECDH, type KeyObject } from 'node:crypto'
import pRetry from 'p-retry'
import { chunks } from '../core/collections'
import type { WebPushSubscription } from '../core/notifications'
import { countServerMetric, reportServerFailure, requestOutcome } from './posthog'

export type WebPushMessage = { to: WebPushSubscription; title: string; body: string; path: string }

export type WebPushSender = {
  /** The VAPID public key a browser subscribes with, as unpadded base64url. */
  publicKey: string
  send: (messages: readonly WebPushMessage[]) => Promise<void>
}

type WebPushSenderOptions = {
  publicKey: string
  privateKey: string
  /** Who the push service may contact about this sender: an `https:` or `mailto:` URL. */
  subject: string
  /** Called with endpoints the push service says are gone, so they stop being sent to. */
  onGone: (endpoints: string[]) => Promise<void> | void
  fetch?: typeof fetch
  log?: (event: string, detail: Record<string, unknown>) => void
}

const REQUEST_TIMEOUT_MS = 10_000
const ATTEMPTS = 3
const RETRY_BASE_MS = 1_000
const PARALLEL_REQUESTS = 10
/** How long an offline browser is still worth reaching: a day-old notice has usually been acted on elsewhere. */
const TTL_SECONDS = 24 * 60 * 60
const RECORD_SIZE = 4096
/** A VAPID token may live at most a day; a short one is plenty for one request. */
const TOKEN_SECONDS = 12 * 60 * 60

class RefusedRequest extends Error {
  constructor(readonly retryable: boolean) {
    super('web push request refused')
  }
}

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
const fromBase64url = (text: string) => Buffer.from(text, 'base64url')

export function webPushSenderFromEnvironment(
  onGone: WebPushSenderOptions['onGone'],
  environment: NodeJS.ProcessEnv = process.env,
): WebPushSender | null {
  const publicKey = environment.WEB_PUSH_PUBLIC_KEY?.trim()
  const privateKey = environment.WEB_PUSH_PRIVATE_KEY?.trim()
  const subject = environment.APP_URL?.trim()
  if (!publicKey || !privateKey || !subject) return null
  try {
    return webPushSender({ publicKey, privateKey, subject, onGone })
  } catch (error) {
    // A malformed key turns browser notifications off rather than stopping the server.
    reportServerFailure({ event: 'web_push_key_invalid', error })
    return null
  }
}

function vapidKey(publicKey: string, privateKey: string): KeyObject {
  const point = fromBase64url(publicKey)
  if (point.length !== 65 || point[0] !== 4) throw new Error('WEB_PUSH_PUBLIC_KEY is not an uncompressed P-256 point')
  // A JWK import accepts a private key with any public point, and push services would refuse every request it signs.
  const derived = createECDH('prime256v1')
  derived.setPrivateKey(fromBase64url(privateKey))
  if (!derived.getPublicKey().equals(point)) throw new Error('WEB_PUSH_PRIVATE_KEY does not belong to WEB_PUSH_PUBLIC_KEY')
  return createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: base64url(point.subarray(1, 33)), y: base64url(point.subarray(33)) },
    format: 'jwk',
  })
}

/** The `Authorization` header that proves this server holds the key a subscription was made with. */
export function vapidAuthorization(endpoint: string, key: KeyObject, publicKey: string, subject: string, now = Date.now()) {
  const encode = (value: object) => base64url(Buffer.from(JSON.stringify(value)))
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + TOKEN_SECONDS, sub: subject }
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode(claims)}`
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${unsigned}.${base64url(signature)}, k=${publicKey}`
}

function freshKeys() {
  const keys = createECDH('prime256v1')
  keys.generateKeys()
  return keys
}

/**
 * The `aes128gcm` body of one push message for one subscription.
 *
 * `local` and `salt` are fresh for every message; a test passes fixed ones.
 */
export function encryptPayload(
  plaintext: Uint8Array,
  subscription: Pick<WebPushSubscription, 'p256dh' | 'auth'>,
  local: ECDH = freshKeys(),
  salt: Uint8Array = randomBytes(16),
) {
  const userAgentKey = fromBase64url(subscription.p256dh)
  const serverKey = local.getPublicKey()
  const info = (label: string, ...context: Uint8Array[]) => Buffer.concat([Buffer.from(`${label}\0`), ...context])
  const ikm = hkdfSync(
    'sha256',
    local.computeSecret(userAgentKey),
    fromBase64url(subscription.auth),
    info('WebPush: info', userAgentKey, serverKey),
    32,
  )
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: aes128gcm'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: nonce'), 12))
  const cipher = createCipheriv('aes-128-gcm', key, nonce)
  // One record, so the padding delimiter is the last-record one.
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  Buffer.from(salt).copy(header)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(serverKey.length, 20)
  return Buffer.concat([header, serverKey, sealed])
}

export function webPushSender(options: WebPushSenderOptions): WebPushSender {
  const request = options.fetch ?? fetch
  const log = options.log ?? ((event, detail) => reportServerFailure({ event, ...detail }, 'warn'))
  const key = vapidKey(options.publicKey, options.privateKey)

  /** Whether the push service has forgotten this subscription. */
  async function deliver(message: WebPushMessage): Promise<boolean> {
    const payload = Buffer.from(JSON.stringify({ title: message.title, body: message.body, path: message.path }))
    return pRetry(
      async (attempt) => {
        let response: Response
        try {
          response = await request(message.to.endpoint, {
            method: 'POST',
            headers: {
              authorization: vapidAuthorization(message.to.endpoint, key, options.publicKey, options.subject),
              'content-encoding': 'aes128gcm',
              'content-type': 'application/octet-stream',
              ttl: String(TTL_SECONDS),
              urgency: 'normal',
            },
            body: encryptPayload(payload, message.to),
            // The endpoint was checked against the push services; a redirect could lead anywhere.
            redirect: 'error',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          })
          countServerMetric('web_push.requests', requestOutcome(response.status))
        } catch (error) {
          countServerMetric('web_push.requests', requestOutcome())
          log('web_push_request_failed', { error, attempt })
          throw error
        }
        if (response.ok) return false
        if (response.status === 404 || response.status === 410) return true
        log('web_push_request_refused', { status: response.status, attempt })
        throw new RefusedRequest(response.status === 429 || response.status >= 500)
      },
      {
        retries: ATTEMPTS - 1,
        minTimeout: RETRY_BASE_MS,
        factor: 2,
        shouldRetry: ({ error }) => !(error instanceof RefusedRequest) || error.retryable,
      },
    ).catch(() => false)
  }

  return {
    publicKey: options.publicKey,
    async send(messages) {
      const gone: string[] = []
      for (const batch of chunks(messages, PARALLEL_REQUESTS)) {
        const outcomes = await Promise.all(batch.map(deliver))
        batch.forEach((message, index) => outcomes[index] && gone.push(message.to.endpoint))
      }
      if (!gone.length) return
      try {
        await options.onGone([...new Set(gone)])
      } catch (error) {
        log('web_push_cleanup_failed', { error })
      }
    },
  }
}
