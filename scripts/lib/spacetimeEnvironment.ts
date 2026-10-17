/** The auth settings a product module publish declares (`spacetimedb/src/admission.ts` validates them). */
export type ProductAuth = { issuer: string; audience: string; operator: string }

/** The `spacetime-environment` values SpacetimeDB stores with the product module and keeps across later publishes. */
export function moduleEnvironment({ issuer, audience, operator }: ProductAuth) {
  return { AUTH_ISSUER: issuer, AUTH_AUDIENCE: audience, OPERATOR_IDENTITY: operator }
}
