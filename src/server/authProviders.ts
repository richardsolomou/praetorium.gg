import type { BetterAuthOptions } from 'better-auth'
import { configuredProviderOptions } from 'ras-stack/auth'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { appleCredentials } from './appleAuth'

type AuthEnvironment = NodeJS.ProcessEnv

export function configuredAuthProviderOptions(
  environment: AuthEnvironment = process.env,
): NonNullable<BetterAuthOptions['socialProviders']> {
  const options: NonNullable<BetterAuthOptions['socialProviders']> = configuredProviderOptions(['google', 'discord'], environment, {
    rejectPartial: true,
  })
  const apple = appleCredentials(environment)
  if (apple) options.apple = async () => ({ clientId: apple.clientId, clientSecret: await apple.clientSecret() })
  return options
}

export function configuredAuthProviders(environment: AuthEnvironment = process.env) {
  const options = configuredAuthProviderOptions(environment)
  return SOCIAL_PROVIDERS.filter((provider) => Boolean(options[provider]))
}
