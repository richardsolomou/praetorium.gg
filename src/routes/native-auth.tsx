import { createFileRoute } from '@tanstack/react-router'
import { localRedirectPath } from 'ras-stack/auth/client'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { NativeAuthPage, type NativeAuthSearch } from '../client/features/account/NativeAuthPage'
import { searchFlag } from '../client/searchParams'

export const Route = createFileRoute('/native-auth')({
  validateSearch: (search: Record<string, unknown>): NativeAuthSearch => ({
    action: search.action === 'link' || search.action === 'sign-in' ? search.action : undefined,
    complete: searchFlag(search.complete) || undefined,
    error: typeof search.error === 'string' && search.error ? search.error : undefined,
    next: localRedirectPath(search.next),
    provider: SOCIAL_PROVIDERS.find((provider) => provider === search.provider),
    requestSignUp: searchFlag(search.requestSignUp) || undefined,
    bridge:
      search.bridge === undefined
        ? 1
        : search.bridge === 3 || search.bridge === '3'
          ? 3
          : search.bridge === 2 || search.bridge === '2'
            ? 2
            : search.bridge === 1 || search.bridge === '1'
              ? 1
              : undefined,
    challenge: typeof search.challenge === 'string' && /^[\w-]{43}$/.test(search.challenge) ? search.challenge : undefined,
  }),
  component: () => <NativeAuthPage search={Route.useSearch()} />,
})
