import { lazy, Suspense, type ComponentType } from 'react'
import { useHydrated } from './useClientValue'

const absent = () => null

/**
 * A component the server never renders, mounted once the page has hydrated from a chunk of its own, so the bundle
 * every page loads first leaves it out. A chunk that fails to load leaves it absent, as a failed request would.
 */
export function deferred<P extends object>(load: () => Promise<ComponentType<P>>) {
  const Lazy = lazy(() =>
    load().then(
      (component) => ({ default: component }),
      () => ({ default: absent }),
    ),
  )
  return function Deferred(props: P) {
    return useHydrated() ? (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    ) : null
  }
}
