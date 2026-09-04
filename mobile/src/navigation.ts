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
  return `(() => {
    const target = new URL(${JSON.stringify(decision.url)});
    const tab = Array.from(document.querySelectorAll('[data-native-app-tabs] a')).find((link) => {
      const candidate = new URL(link.href);
      return candidate.pathname === target.pathname && !target.search && !target.hash;
    });
    if (tab) tab.click();
    else window.location.assign(target.href);
    window.ReactNativeWebView.postMessage(JSON.stringify({ version: 3, type: 'native-navigation-result', url: target.href }));
  })(); true;`
}

export const APPLICATION_SEARCH_SCRIPT = `document.dispatchEvent(new Event('praetorium:open-search')); true;`

export function applicationAccountMenuScript(open: boolean) {
  return `document.dispatchEvent(new CustomEvent('praetorium:set-account-menu', { detail: { open: ${open} } })); true;`
}
