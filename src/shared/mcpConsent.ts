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
