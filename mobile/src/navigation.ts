const PRODUCTION_APP_URL = 'https://praetorium.gg'

export function resolveApplicationUrl(configured = process.env.EXPO_PUBLIC_APP_URL ?? process.env.EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL) {
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

const WEB_PROTOCOLS = new Set(['http:', 'https:'])
const EXTERNAL_PROTOCOLS = new Set([...WEB_PROTOCOLS, 'mailto:', 'tel:'])

export type ExternalOpenStrategy = 'system' | 'in-app-browser'

// An external link opens in the operating system when a handler exists. A web
// page also lists the in-app browser as a fallback, so a device that cannot
// hand the link to the system still reaches the page instead of a dead end.
export function externalOpenStrategies(url: string, canOpenWithSystem: boolean): ExternalOpenStrategy[] {
  const strategies: ExternalOpenStrategy[] = []
  if (canOpenWithSystem) strategies.push('system')
  if (isWebPageUrl(url)) strategies.push('in-app-browser')
  return strategies
}

function isWebPageUrl(url: string) {
  try {
    return WEB_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

// A WebView HTTP error tears down the shell only for the main document. A
// sub-resource that answers with an error status must leave the loaded page in
// place. The main document is the resource whose URL matches the frame the
// WebView is loading, ignoring the fragment because it sends no request.
export function isMainFrameHttpError(errorUrl: string, statusCode: number, mainFrameUrl: string | null) {
  if (statusCode < 400 || mainFrameUrl === null) return false
  return documentKey(errorUrl) === documentKey(mainFrameUrl)
}

function documentKey(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

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
