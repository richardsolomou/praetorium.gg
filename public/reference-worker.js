const REFERENCE_CACHE = 'praetorium-reference-v2'
const HOSTED_PATH = /^\/(?:api|sign-in|sign-up|reset-password|verify-email|oauth|\.well-known)(?:\/|$)/
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin) return
  event.respondWith(
    (async () => {
      const saved = await (await caches.open(REFERENCE_CACHE)).match('/offline-reference.html')
      if (saved && !HOSTED_PATH.test(url.pathname)) return saved
      try {
        return await fetch(event.request, { signal: AbortSignal.timeout(5000) })
      } catch {
        return (
          (!HOSTED_PATH.test(url.pathname) && saved) ||
          new Response('Connect to save the reference before using it offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        )
      }
    })(),
  )
})
