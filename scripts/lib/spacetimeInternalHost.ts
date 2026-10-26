/** A Docker service name on the deployment's private network, where SpacetimeDB may be reached over plain HTTP. */
export const isSpacetimeInternalHost = (host: string) => /^[a-z][a-z0-9-]{1,63}$/.test(host)
