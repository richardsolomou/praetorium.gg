/**
 * The Content Security Policy's sources by directive, which `middleware.ts` turns into the header. Add the sources the
 * application's own features load from here, so recipe updates to the middleware never conflict with them.
 *
 * `cspPlugin.ts` widens the header at runtime with what each deployment configures: where pictures are served from,
 * and `'unsafe-eval'` for SpacetimeDB's binary codecs when it is hosted.
 */
export const contentSecurityPolicy: Record<string, string[]> = {
  'default-src': ["'self'"],
  // Start streams its hydration data as inline scripts, the root route adds chunk recovery, and every page starts with
  // the chunk import map. A hash or nonce would switch 'unsafe-inline' off for Start's scripts, which carry neither.
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  // Faction icons, images in support replies, and the hosted service's avatars, which a production copy carries into a
  // development stack that serves its own uploads from elsewhere.
  'img-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://us-media.posthog.com', 'https://s3.praetorium.gg'],
  'font-src': ["'self'", 'data:'],
  // Rules text loads from its pinned upstream files.
  'connect-src': ["'self'", 'https://raw.githubusercontent.com'],
  // Combat calculations run in bundled workers.
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
}
