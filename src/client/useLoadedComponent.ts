import { useEffect, useState, type ComponentType } from 'react'

/** Render a browser-only component once its code is available, without suspending the hydrating tree. */
export function useLoadedComponent<Props>(load: () => Promise<ComponentType<Props>>, enabled = true) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null)
  useEffect(() => {
    if (!enabled || Component) return
    let active = true
    void load().then(
      (loaded) => {
        if (active) setComponent(() => loaded)
      },
      () => {
        // Optional UI can retry when it is requested again.
      },
    )
    return () => {
      active = false
    }
  }, [load, enabled, Component])
  return Component
}
