export function spacetimePublicUri(appUrl: string | undefined) {
  if (!appUrl) throw new Error('APP_URL is required for SpacetimeDB realtime')
  const app = new URL(appUrl)
  if (!['http:', 'https:'].includes(app.protocol) || app.pathname !== '/' || app.search || app.hash || app.username || app.password) {
    throw new Error('Invalid APP_URL for SpacetimeDB realtime')
  }
  return new URL('/spacetime/', app).toString()
}
