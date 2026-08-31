const PRODUCTION_APP_URL = 'https://praetorium.gg'

export function resolveApplicationUrl(configured = process.env.EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL) {
  if (!configured) return PRODUCTION_APP_URL
  try {
    const parsed = new URL(configured)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error()
    return parsed.origin
  } catch {
    throw new Error('EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL must be a valid HTTP origin.')
  }
}

export const APP_URL = resolveApplicationUrl()

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

export function initialApplicationUrl(url: string | null) {
  if (!url) return APP_URL
  const decision = classifyNavigation(url)
  return decision.kind === 'internal' ? decision.url : APP_URL
}

export function applicationNavigationScript(url: string) {
  const decision = classifyNavigation(url)
  if (decision.kind !== 'internal') return null
  return `window.location.assign(${JSON.stringify(decision.url)}); true;`
}
