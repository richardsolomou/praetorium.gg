import { SOCIAL_AUTH_PROVIDER_NAMES, type SocialAuthProvider } from '../../../authConfig'
import { AuthMethodIcon } from '../account/AuthMethodIcon'

export function methodName(providerId: string) {
  return providerId === 'credential' ? 'Password' : (SOCIAL_AUTH_PROVIDER_NAMES[providerId as SocialAuthProvider] ?? providerId)
}

export function MethodIcon({ providerId, className }: { providerId: string; className?: string }) {
  return <AuthMethodIcon method={providerId === 'credential' ? 'password' : (providerId as SocialAuthProvider)} className={className} />
}

export function count(total: number, one: string, many: string) {
  return `${total} ${total === 1 ? one : many}`
}
