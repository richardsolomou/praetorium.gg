import { SOCIAL_AUTH_PROVIDER_NAMES, type SocialAuthProvider } from '../../../authConfig'

export function methodName(providerId: string) {
  return providerId === 'credential' ? 'Password' : (SOCIAL_AUTH_PROVIDER_NAMES[providerId as SocialAuthProvider] ?? providerId)
}
