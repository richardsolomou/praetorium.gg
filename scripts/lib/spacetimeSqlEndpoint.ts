export function spacetimeSqlEndpoint(baseUrl: string, database: string) {
  const base = new URL(baseUrl)
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)
  if ((!local && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Invalid SpacetimeDB URL')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database)) throw new Error('Invalid SpacetimeDB database name')
  return new URL(`/v1/database/${database}/sql`, base)
}
