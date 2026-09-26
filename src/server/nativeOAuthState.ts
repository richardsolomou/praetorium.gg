import { SOCIAL_PROVIDERS } from '../authConfig'

export function isNativeOAuthState(value: string, state: string, provider: string, baseURL: string) {
  try {
    const stored = JSON.parse(value) as Record<string, unknown>
    if (stored.oauthState !== state || typeof stored.expiresAt !== 'number' || stored.expiresAt < Date.now()) return false
    if (typeof stored.callbackURL !== 'string' || stored.callbackURL !== stored.errorURL) return false
    const callback = new URL(stored.callbackURL, baseURL)
    const base = new URL(baseURL)
    const search = callback.searchParams
    const allowed = new Set(['action', 'bridge', 'challenge', 'complete', 'next', 'provider', 'requestSignUp'])
    if (callback.origin !== base.origin || callback.pathname !== '/native-auth') return false
    if ([...search.keys()].some((key) => !allowed.has(key))) return false
    if (search.get('action') !== 'sign-in' && search.get('action') !== 'link') return false
    if (search.get('provider') !== provider || !SOCIAL_PROVIDERS.includes(provider as (typeof SOCIAL_PROVIDERS)[number])) return false
    if (search.get('bridge') !== '2' && search.get('bridge') !== '3') return false
    if (!/^[-\w]{43}$/.test(search.get('challenge') ?? '') || search.get('complete') !== 'true') return false
    const next = search.get('next')
    return Boolean(next?.startsWith('/') && !next.startsWith('//'))
  } catch {
    return false
  }
}
