import { loopback } from './origins'

/**
 * Where an address sends whoever follows it, in words: its host, or an app on the same device for a loopback address
 * or one no browser opens. Null when it is no address.
 */
export function consentDestination(address: string | null) {
  const parsed = address ? URL.parse(address) : null
  if (!parsed) return null
  const web = parsed.protocol === 'https:' || parsed.protocol === 'http:'
  return web && !loopback(parsed.hostname) ? parsed.hostname : 'an app on this device'
}
