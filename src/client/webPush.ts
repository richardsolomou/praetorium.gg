import { posthog } from 'posthog-js'
import { registerWebPush, unregisterWebPush } from './functions'
import { supportsNativePush } from './nativeBridge'

const WORKER = '/notice-worker.js'
// A scope with no pages, so the notice worker never handles a navigation.
const SCOPE = '/notice-worker/'

/** Whether this browser can show notices pushed to it. The app shell has its own notifications. */
export function supportsWebPush() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !supportsNativePush()
  )
}

function activated(registration: ServiceWorkerRegistration) {
  const incoming = registration.installing ?? registration.waiting
  if (registration.active || !incoming) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const settled = () => {
      if (incoming.state === 'activated' || incoming.state === 'redundant') resolve()
    }
    incoming.addEventListener('statechange', settled)
    settled()
  })
}

const base64url = (key: ArrayBuffer | null) =>
  key
    ? btoa(String.fromCharCode(...new Uint8Array(key)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '')
    : ''

/** This browser's subscription, if it has one; never asks for permission. */
export async function browserSubscription() {
  const registration = await navigator.serviceWorker.getRegistration(SCOPE)
  return (await registration?.pushManager.getSubscription()) ?? null
}

async function save(subscription: PushSubscription) {
  await registerWebPush({
    data: {
      endpoint: subscription.endpoint,
      p256dh: base64url(subscription.getKey('p256dh')),
      auth: base64url(subscription.getKey('auth')),
    },
  })
}

/**
 * Ask for permission, subscribe and bind this browser to the signed-in account.
 *
 * Only ever called from a player's tap, since browsers show their prompt only then.
 */
export async function turnOnWebPush(key: string, surface: 'home' | 'profile'): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    const registration = await navigator.serviceWorker.register(WORKER, { scope: SCOPE })
    await activated(registration)
    let subscription = await registration.pushManager.getSubscription()
    // A subscription made with a key this instance no longer holds can never be sent to.
    if (subscription && base64url(subscription.options.applicationServerKey) !== key) {
      await subscription.unsubscribe()
      subscription = null
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await save(subscription)
  }
  posthog.capture('web_push_permission_requested', { status: permission, surface })
  return permission
}

export async function turnOffWebPush() {
  const subscription = await browserSubscription()
  if (!subscription) return
  await unregisterWebPush({ data: { endpoint: subscription.endpoint } })
  await subscription.unsubscribe()
}

/**
 * Keep a subscribed browser bound to whoever is signed in, with its current endpoint,
 * since a browser may replace its subscription at any time. One made with a key this instance no longer holds is dropped,
 * since every push to it would be refused and never cleaned up.
 */
export async function syncThisBrowser(key: string) {
  const subscription = Notification.permission === 'granted' ? await browserSubscription() : null
  if (!subscription) return
  if (base64url(subscription.options.applicationServerKey) === key) await save(subscription)
  else await subscription.unsubscribe()
}

/**
 * Stop this browser receiving the signed-out account's notices.
 *
 * Unlike an app device, the next account here has to choose notifications again.
 * Never throws, because signing out must not fail because the server could not be told.
 */
export async function forgetThisBrowser() {
  try {
    if (supportsWebPush()) await turnOffWebPush()
  } catch {
    await (await browserSubscription().catch(() => null))?.unsubscribe().catch(() => false)
  }
}
