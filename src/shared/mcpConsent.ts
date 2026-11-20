/**
 * What the consent page's loader refuses with when a connection cannot go ahead but nothing is broken.
 *
 * TanStack Start flattens the thrown `Response` into a plain `Error` holding its body, so the
 * body is all the browser has to recognise the refusal by; it is named once here for both sides.
 */
export const MCP_CONSENT_REFUSALS = {
  expired: 'This authorization request has expired.',
  unknown_client: 'This app is no longer registered.',
} as const

type McpConsentRefusal = keyof typeof MCP_CONSENT_REFUSALS

export function mcpConsentRefusal(error: unknown): McpConsentRefusal | null {
  if (!(error instanceof Error)) return null
  const refusal = Object.entries(MCP_CONSENT_REFUSALS).find(([, message]) => message === error.message)
  return refusal ? (refusal[0] as McpConsentRefusal) : null
}

/**
 * Where allowing a connection sends the player and their access, in words. A client names itself, so this is the one
 * thing on the consent screen that tells an assistant apart from an app registered under its name. Null when the
 * address cannot be read.
 */
export function mcpConsentDestination(redirectUri: string | null) {
  const address = redirectUri ? URL.parse(redirectUri) : null
  if (!address) return null
  if (address.protocol !== 'https:' && address.protocol !== 'http:') return 'an app on this device'
  return ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) ? 'an app on this device' : address.hostname
}
