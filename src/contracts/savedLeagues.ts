/**
 * A saved event response or queued draft from before each event named its host, which no reader can show. It is
 * dropped, so the app reads the event from the server again.
 */
export function predatesEventHosts(data: unknown) {
  return typeof data === 'object' && data !== null && !Array.isArray(data) && !('kind' in data)
}
