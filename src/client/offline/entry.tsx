import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import { getRouter } from '../../router'

const router = getRouter()
window.addEventListener('praetorium-app-navigate', (event) => {
  const target = new URL(String((event as CustomEvent).detail), location.origin)
  if (target.origin === location.origin) void router.navigate({ href: target.pathname + target.search + target.hash })
})
window.addEventListener('praetorium-app-back', () => router.history.back())
const start = window.PraetoriumOfflineStart ?? window.location.pathname + window.location.search + window.location.hash
if (window.ReactNativeWebView) {
  router.update({ context: router.options.context, history: createMemoryHistory({ initialEntries: [start] }) })
  router.subscribe('onBeforeLoad', ({ toLocation }) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'offline-location', path: toLocation.href }))
  })
  router.subscribe('onResolved', () => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'offline-location', path: router.state.location.href }))
  })
}
void router.load().then(() => {
  createRoot(document).render(<RouterProvider router={router} />)
})

document.addEventListener(
  'click',
  (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(anchor instanceof HTMLAnchorElement)) return
    const target = new URL(anchor.href)
    if (target.origin !== location.origin || !/^\/(?:sign-in|sign-up|api)(?:\/|$)/.test(target.pathname)) return
    event.preventDefault()
    event.stopPropagation()
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'offline-retry', path: target.pathname + target.search + target.hash }))
    else window.location.assign(target.href)
  },
  true,
)
