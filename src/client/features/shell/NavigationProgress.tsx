import { useRouterState } from '@tanstack/react-router'

/**
 * A Field Green runner drawn under the header while a page is on its way, so a tap on a slow connection is seen to have
 * landed. It waits out a quick load, then draws most of the way across once and holds there; it never loops.
 */
export function NavigationProgress() {
  const pending = useRouterState({ select: (state) => state.status === 'pending' })
  return pending ? (
    <div
      aria-hidden
      data-navigation-progress
      className="pointer-events-none fixed top-(--app-header) right-0 left-(--app-chrome-left) z-50 h-0.5 origin-left animate-navigate bg-parchment motion-reduce:hidden"
    />
  ) : null
}
