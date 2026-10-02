import { afterEach, expect, it, vi } from 'vitest'
import { POSTHOG_BROWSER_OPTIONS, browserEventContext, telemetryFeature } from './posthog'

afterEach(() => vi.unstubAllGlobals())

it.each([
  ['/', 'home'],
  ['/rosters', 'rosters'],
  ['/rosters/private-roster/edit', 'rosters'],
  ['/battles/private-battle', 'battles'],
  ['/leagues/private-league', 'leagues'],
  ['/factions/source/datasheets/unit', 'factions'],
  ['/rules/book/section', 'rules'],
  ['/missions/pack/matchups/first/second', 'missions'],
  ['/mission-packs/pack', 'missions'],
  ['/force-dispositions/disposition', 'force-dispositions'],
  ['/simulator', 'simulator'],
  ['/friends', 'friends'],
  ['/invite/private-invite', 'friends'],
  ['/users/private-user', 'players'],
  ['/leaderboard', 'players'],
  ['/sign-in', 'account'],
  ['/profile', 'account'],
  ['/reset-password', 'account'],
  ['/admin', 'admin'],
  ['/data-updates/source', 'data-updates'],
  ['/support', 'support'],
  ['/privacy', 'legal'],
  ['/unknown/private-value', 'other'],
  ['/toString', 'other'],
])('groups %s into the bounded %s feature', (path, feature) => {
  expect(telemetryFeature(path)).toBe(feature)
})

const event = (properties: Record<string, unknown> = {}) => ({ uuid: 'event', event: '$pageview', properties })

it('adds only bounded context to an existing browser event', () => {
  vi.stubGlobal('window', { location: { pathname: '/battles/private-token' } })
  expect(browserEventContext(event({ round: 2 }))?.properties).toEqual({ round: 2, feature: 'battles', surface: 'web' })
})

it('uses the captured page for a pageleave after navigation', () => {
  vi.stubGlobal('window', { location: { pathname: '/rosters' } })
  expect(browserEventContext(event({ $pathname: '/battles/private-token' }))?.properties.feature).toBe('battles')
})

it('identifies a native WebView without capturing bridge contents', () => {
  vi.stubGlobal('window', { location: { pathname: '/rosters' }, PraetoriumNative: { bridgeVersion: 3 } })
  expect(browserEventContext(event())?.properties).toEqual({ feature: 'rosters', surface: 'native' })
})

it('preserves a dropped event', () => {
  expect(browserEventContext(null)).toBeNull()
})

it('leaves server rendering alone', () => {
  expect(browserEventContext(event())).toEqual(event())
})

it('installs context on the SDK send boundary', () => {
  expect(POSTHOG_BROWSER_OPTIONS.before_send).toBe(browserEventContext)
})
