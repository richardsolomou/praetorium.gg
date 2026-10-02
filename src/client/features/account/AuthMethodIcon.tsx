import { KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SocialAuthProvider } from '../../../authConfig'

export { SOCIAL_AUTH_PROVIDER_NAMES, type SocialAuthProvider } from '../../../authConfig'

export function AuthMethodIcon({ method, className }: { method: SocialAuthProvider | 'password'; className?: string }) {
  if (method === 'password') return <KeyRound className={cn('size-4', className)} aria-hidden />
  if (method === 'apple') return <AppleIcon className={className} />
  if (method === 'google') return <GoogleIcon className={className} />
  if (method === 'github') return <GithubIcon className={className} />
  return <DiscordIcon className={className} />
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4', className)} aria-hidden>
      <path
        fill="currentColor"
        d="M12 .297a12 12 0 0 0-3.793 23.386c.6.111.82-.261.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.304-5.466-1.332-5.466-5.93 0-1.311.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.323 3.301 1.23a11.52 11.52 0 0 1 6.004 0c2.291-1.553 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.91 1.235 3.221 0 4.61-2.805 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .32.216.694.825.576A12.001 12.001 0 0 0 12 .297Z"
      />
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4', className)} aria-hidden>
      <path
        fill="currentColor"
        d="M17.05 12.54c.02-2.05 1.68-3.04 1.75-3.08a3.76 3.76 0 0 0-2.96-1.6c-1.24-.13-2.44.74-3.07.74-.65 0-1.62-.73-2.67-.71a3.93 3.93 0 0 0-3.31 2.02c-1.43 2.48-.36 6.12 1.01 8.13.69.99 1.49 2.09 2.54 2.05 1.03-.04 1.42-.66 2.67-.66 1.24 0 1.61.66 2.69.64 1.1-.02 1.8-.99 2.46-1.98a8.1 8.1 0 0 0 1.13-2.3 3.55 3.55 0 0 1-2.24-3.25ZM15.03 6.55a3.61 3.61 0 0 0 .83-2.61 3.67 3.67 0 0 0-2.38 1.24 3.47 3.47 0 0 0-.85 2.52 3.03 3.03 0 0 0 2.4-1.15Z"
      />
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4', className)} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.94-6.16-4.54H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.72.12-1.42.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.54 10.54 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={cn('size-4', className)} aria-hidden>
      <path
        fill="#5865F2"
        d="M40.575 0c-.619 1.099-1.174 2.235-1.68 3.397a48.81 48.81 0 0 0-14.497 0A30.7 30.7 0 0 0 22.719 0 48.57 48.57 0 0 0 9.648 4.028C1.39 16.265-.846 28.186.266 39.943A51.4 51.4 0 0 0 16.29 47.987a32.6 32.6 0 0 0 3.436-5.531 31.5 31.5 0 0 1-5.405-2.576c.455-.328.897-.67 1.326-.998 10.14 4.774 21.885 4.774 32.038 0 .429.354.871.695 1.326.998a31.4 31.4 0 0 1-5.418 2.589 32.7 32.7 0 0 0 3.435 5.531 51.3 51.3 0 0 0 16.025-8.032c1.314-13.638-2.247-25.459-9.408-35.927A48.6 48.6 0 0 0 40.588.025L40.575 0ZM21.14 32.707c-3.119 0-5.708-2.829-5.708-6.327 0-3.498 2.488-6.339 5.696-6.339 3.207 0 5.758 2.854 5.707 6.339-.05 3.486-2.513 6.327-5.695 6.327Zm21.039 0c-3.132 0-5.696-2.829-5.696-6.327 0-3.498 2.488-6.339 5.696-6.339 3.207 0 5.746 2.854 5.695 6.339-.05 3.486-2.513 6.327-5.695 6.327Z"
      />
    </svg>
  )
}
