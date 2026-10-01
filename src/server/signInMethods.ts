import type { SocialAuthProvider } from '../authConfig'
import { app } from './app'
import { configuredAuthProviders } from './authProviders'

/**
 * Removes one sign-in method, refusing the last usable one and a password that two-factor depends on.
 * A removed Apple link also revokes Apple's tokens, as Apple requires.
 */
export async function unlinkSignInMethod(userId: string, provider: 'credential' | SocialAuthProvider) {
  const instance = app()
  const result = await instance.service.unlinkAccount(userId, provider, ['credential', ...configuredAuthProviders()])
  if (result.status === 'removed' && provider === 'apple') await instance.auth.revokeAppleTokens(result.account)
  return result.status
}
