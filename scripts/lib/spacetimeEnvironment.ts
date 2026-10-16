/** The auth settings a product module publish declares (`spacetimedb/src/admission.ts` validates them). */
export type ProductAuth = { issuer: string; audience: string; operator: string }

/** `spacetime-environment` publish headers, which SpacetimeDB stores with the module and keeps across later publishes. */
export function moduleEnvironment({ issuer, audience, operator }: ProductAuth): [string, string][] {
  return Object.entries({ AUTH_ISSUER: issuer, AUTH_AUDIENCE: audience, OPERATOR_IDENTITY: operator }).map(([key, value]) => {
    // A bare header value is visible ASCII without quotes, commas, or backslashes.
    if (!/^[!#-&(-+\--[\]-~]+$/.test(value)) throw new Error(`Invalid ${key} for the product module`)
    return ['spacetime-environment', `${key}=${value}`]
  })
}
