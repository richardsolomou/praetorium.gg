export const APP_URL = 'https://praetorium.gg'

type NavigationDecision = { kind: 'internal'; url: string } | { kind: 'external'; url: string } | { kind: 'blocked' }

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function classifyNavigation(url: string): NavigationDecision {
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) return { kind: 'blocked' }
    if (parsed.origin === APP_URL) return { kind: 'internal', url: parsed.href }
    if (EXTERNAL_PROTOCOLS.has(parsed.protocol)) return { kind: 'external', url: parsed.href }
  } catch {
    return { kind: 'blocked' }
  }
  return { kind: 'blocked' }
}
