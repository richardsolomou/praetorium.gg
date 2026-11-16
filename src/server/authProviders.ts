import type { BetterAuthOptions } from 'better-auth'
import { SOCIAL_PROVIDERS } from '../authConfig'
import { appleCredentials } from './appleAuth'

type AuthEnvironment = NodeJS.ProcessEnv

export function configuredAuthProviderOptions(
  environment: AuthEnvironment = process.env,
): NonNullable<BetterAuthOptions['socialProviders']> {
  const options: NonNullable<BetterAuthOptions['socialProviders']> = {}
  // A provider with only one of its pair throws, so a typo cannot hide its button.
  for (const provider of ['google', 'discord', 'github'] as const) {
    const name = provider.toUpperCase()
    const clientId = environment[`${name}_CLIENT_ID`]?.trim()
    const clientSecret = environment[`${name}_CLIENT_SECRET`]?.trim()
    if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error(`${name}_CLIENT_ID and ${name}_CLIENT_SECRET must be set together`)
    if (clientId && clientSecret) options[provider] = { clientId, clientSecret }
  }
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
