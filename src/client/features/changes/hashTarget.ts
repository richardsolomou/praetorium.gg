import { useEffect } from 'react'

/** As much of an element as finding a fragment's target needs. */
type Element<T> = { tagName: string; open?: boolean; parentElement: T | null }

/**
 * The element a fragment names, and every closed `<details>` from it outwards — the target
 * itself included — that has to open before it can be seen. Null for no fragment, or one
 * nothing on the page answers to.
 */
export function hashTarget<T extends Element<T>>(hash: string, byId: (id: string) => T | null): { target: T; closed: T[] } | null {
  const raw = hash.replace(/^#/, '')
  if (!raw) return null
  let id: string
  try {
    id = decodeURIComponent(raw)
  } catch {
    return null
  }
  const target = byId(id)
  if (!target) return null
  const closed: T[] = []
  for (let node: T | null = target; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS' && !node.open) closed.push(node)
  }
  return { target, closed }
}

/**
 * Opens the rows the address's fragment points into and brings its target into view, when the
 * page loads and whenever the fragment changes. A browser may or may not open a closed
 * `<details>` for a fragment by itself, so this does it either way.
 */
export function useOpenHashTarget() {
  useEffect(() => {
    const reveal = () => {
      const found = hashTarget<HTMLElement>(window.location.hash, (id) => document.getElementById(id))
      if (!found) return
      for (const details of found.closed) if (details instanceof HTMLDetailsElement) details.open = true
      found.target.scrollIntoView({ block: 'start' })
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [])
}
