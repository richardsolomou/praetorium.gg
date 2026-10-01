import type { BetterAuthOptions } from 'better-auth'
import { configuredProviderOptions } from 'ras-stack/auth'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { appleCredentials } from './appleAuth'

type AuthEnvironment = NodeJS.ProcessEnv

export function configuredAuthProviderOptions(
  environment: AuthEnvironment = process.env,
): NonNullable<BetterAuthOptions['socialProviders']> {
  // GitHub is linked to show a sponsor's badge and never signs anybody in; see `createSqliteAuth`.
  const options: NonNullable<BetterAuthOptions['socialProviders']> = configuredProviderOptions(['google', 'discord', 'github'], environment)
  const apple = appleCredentials(environment)
  if (apple) options.apple = async () => ({ clientId: apple.clientId, clientSecret: await apple.clientSecret() })
  return options
}

export function configuredAuthProviders(environment: AuthEnvironment = process.env) {
  const options = configuredAuthProviderOptions(environment)
  return SOCIAL_PROVIDERS.filter((provider) => Boolean(options[provider]))
}

export function githubLinkConfigured(environment: AuthEnvironment = process.env) {
  return Boolean(configuredAuthProviderOptions(environment).github)
}
