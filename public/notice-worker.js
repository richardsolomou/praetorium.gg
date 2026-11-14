// Shows notices pushed to this browser. Its scope holds no pages, so unlike the reference worker it never handles a navigation.
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let notice
  try {
    notice = event.data?.json()
  } catch {
    return
  }
  if (typeof notice?.title !== 'string' || typeof notice.body !== 'string' || typeof notice.path !== 'string') return
  event.waitUntil(
    self.registration.showNotification(notice.title, { body: notice.body, icon: '/email-logo.png', data: { path: notice.path } }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.path ?? '/', self.location.origin)
  if (url.origin === self.location.origin) event.waitUntil(self.clients.openWindow(url.href))
})
