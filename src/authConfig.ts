export const SOCIAL_PROVIDERS = ['google', 'discord'] as const

export type SocialAuthProvider = (typeof SOCIAL_PROVIDERS)[number]

export const SOCIAL_AUTH_PROVIDER_NAMES: Record<SocialAuthProvider, string> = { google: 'Google', discord: 'Discord' }

export const PASSWORD_MIN_LENGTH = 10

export const PROFILE_NAME_MAX_LENGTH = 48

export const PROFILE_IMAGE_MAX_LENGTH = 160_000

const REDIRECT_ORIGIN = 'https://praetorium.invalid'

export function localRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined
  try {
    const resolved = new URL(value, REDIRECT_ORIGIN)
    if (resolved.origin !== REDIRECT_ORIGIN) return undefined
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return undefined
  }
}
