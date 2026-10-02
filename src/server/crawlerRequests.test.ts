import { expect, it } from 'vitest'
import { crawlerRequestEvent } from './crawlerRequests'

const GPTBOT = 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)'
const DAY = new Date('2026-10-02T12:00:00Z')

const read = (url: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(url, { method, headers: { 'user-agent': GPTBOT, 'x-forwarded-for': '203.0.113.7', ...headers } })

it('records a datasheet read with the crawler it came from', () => {
  expect(crawlerRequestEvent(read('https://praetorium.gg/factions/necrons/datasheets/overlord'), 200, DAY)?.properties).toMatchObject({
    $raw_user_agent: GPTBOT,
    $pathname: '/factions/necrons/datasheets/overlord',
    status_code: 200,
  })
})

it('leaves the query string out of the recorded address', () => {
  expect(crawlerRequestEvent(read('https://praetorium.gg/rules/core-rules?q=movement'), 200, DAY)?.properties.$current_url).toBe(
    'https://praetorium.gg/rules/core-rules',
  )
})

it.each(['/battles/secret-token', '/rosters/abc123', '/users/someone', '/leagues/token', '/invite/token', '/sign-in', '/_serverFn/x'])(
  'records nothing for %s, whose address can name a player or their data',
  (path) => {
    expect(crawlerRequestEvent(read(`https://praetorium.gg${path}`), 200, DAY)).toBeNull()
  },
)

it('records the files crawlers read', () => {
  expect(crawlerRequestEvent(read('https://praetorium.gg/llms.txt'), 200, DAY)).not.toBeNull()
})

it('records nothing for a request that is not a read', () => {
  expect(crawlerRequestEvent(read('https://praetorium.gg/factions', {}, 'POST'), 200, DAY)).toBeNull()
})

it('cuts the referrer to its origin', () => {
  expect(
    crawlerRequestEvent(read('https://praetorium.gg/factions', { referer: 'https://www.google.com/search?q=praetorium' }), 200, DAY)
      ?.properties.$referrer,
  ).toBe('https://www.google.com')
})

it('sends no address and no location', () => {
  const properties = crawlerRequestEvent(read('https://praetorium.gg/factions'), 200, DAY)?.properties
  expect([properties && '$ip' in properties, properties?.$geoip_disable]).toEqual([false, true])
})

it('gives one client one id within a day', () => {
  expect(crawlerRequestEvent(read('https://praetorium.gg/factions'), 200, DAY)?.distinctId).toBe(
    crawlerRequestEvent(read('https://praetorium.gg/rules'), 200, DAY)?.distinctId,
  )
})

it('gives the same client a new id the next day', () => {
  expect(crawlerRequestEvent(read('https://praetorium.gg/factions'), 200, DAY)?.distinctId).not.toBe(
    crawlerRequestEvent(read('https://praetorium.gg/factions'), 200, new Date('2026-10-03T12:00:00Z'))?.distinctId,
  )
})

it('tells two addresses with the same browser apart', () => {
  expect(crawlerRequestEvent(read('https://praetorium.gg/factions'), 200, DAY)?.distinctId).not.toBe(
    crawlerRequestEvent(read('https://praetorium.gg/factions', { 'x-forwarded-for': '198.51.100.1' }), 200, DAY)?.distinctId,
  )
})
