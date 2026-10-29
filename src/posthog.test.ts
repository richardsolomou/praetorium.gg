import type { PostHog } from 'posthog-js'
import { afterEach, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ __loaded: false, capture: vi.fn() }))
vi.mock('posthog-js', () => ({ posthog: client }))

import {
  POSTHOG_BROWSER_OPTIONS,
  browserEventContext,
  captureWhenLoaded,
  dropUnactionableExceptions,
  dropWhileImpersonating,
  setImpersonating,
  telemetryFeature,
} from './posthog'

afterEach(() => {
  setImpersonating(false)
  vi.unstubAllGlobals()
  POSTHOG_BROWSER_OPTIONS.loaded(client as unknown as PostHog)
  client.__loaded = false
  client.capture.mockReset()
})

it.each([
  ['/', 'home'],
  ['/rosters', 'rosters'],
  ['/rosters/private-roster/edit', 'rosters'],
  ['/battles/private-battle', 'battles'],
  ['/leagues/private-league', 'leagues'],
  ['/tournaments/private-league', 'leagues'],
  ['/factions/source/datasheets/unit', 'factions'],
  ['/rules/book/section', 'rules'],
  ['/missions/pack/matchups/first/second', 'missions'],
  ['/mission-packs/pack', 'missions'],
  ['/force-dispositions/disposition', 'force-dispositions'],
  ['/simulator', 'simulator'],
  ['/docs/compare-loadouts', 'docs'],
  ['/friends', 'friends'],
  ['/invite/private-invite', 'friends'],
  ['/users/private-user', 'players'],
  ['/leaderboard', 'players'],
  ['/sign-in', 'account'],
  ['/profile', 'account'],
  ['/reset-password', 'account'],
  ['/admin', 'admin'],
  ['/clubs/private-club', 'clubs'],
  ['/whats-new', 'whats-new'],
  ['/mission-matchups/pack/first/second', 'missions'],
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
  expect(
    browserEventContext({
      ...event({ $pathname: '/battles/private-token', $current_url: 'https://praetorium.gg/rosters' }),
      event: '$pageleave',
    })?.properties.feature,
  ).toBe('battles')
})

it('attributes delayed web vitals to the measured page after navigation', () => {
  vi.stubGlobal('window', { location: { pathname: '/rosters' } })
  const properties = { $pathname: '/rosters', $current_url: 'https://praetorium.gg/', $web_vitals_LCP_value: 2800 }
  expect(browserEventContext({ ...event(properties), event: '$web_vitals' })?.properties).toEqual({
    ...properties,
    feature: 'home',
    surface: 'web',
  })
})

it.each([undefined, 42, 'not-a-url'])('keeps captured context when the web-vital URL is %s', (url) => {
  vi.stubGlobal('window', { location: { pathname: '/rosters' } })
  expect(
    browserEventContext({ ...event({ $pathname: '/battles/private-token', $current_url: url }), event: '$web_vitals' })?.properties.feature,
  ).toBe('battles')
})

it('identifies a native WebView without capturing bridge contents', () => {
  vi.stubGlobal('window', { location: { pathname: '/rosters' }, PraetoriumNative: { bridgeVersion: 3 } })
  expect(browserEventContext(event())?.properties).toEqual({ feature: 'rosters', surface: 'native' })
})

it('leaves server rendering alone', () => {
  expect(browserEventContext(event())).toEqual(event())
})

it('installs filtering and context on the SDK send boundary', () => {
  expect(POSTHOG_BROWSER_OPTIONS.before_send).toEqual([dropWhileImpersonating, dropUnactionableExceptions, browserEventContext])
})

const exception = (value: string) => ({ ...event({ $exception_list: [{ type: 'Error', value }] }), event: '$exception' })

it.each([
  'Script error.',
  'ResizeObserver loop completed with undelivered notifications.',
  'Non-Error promise rejection captured with value: Object Not Found Matching Id:4, MethodName:update, ParamCount:4',
])('drops the unactionable browser exception %s', (value) => {
  expect(dropUnactionableExceptions(exception(value))).toBeNull()
})

it('keeps an exception that names a fault in the page', () => {
  const error = exception("Script error in loadout: Cannot read properties of undefined (reading 'flatMap')")
  expect(dropUnactionableExceptions(error)).toBe(error)
})

it('captures at once when the SDK has loaded', () => {
  client.__loaded = true
  captureWhenLoaded('page_not_found', { path: '/:id' })
  expect(client.capture).toHaveBeenCalledWith('page_not_found', { path: '/:id' })
})

it('holds a capture made before the SDK loads', () => {
  captureWhenLoaded('page_not_found', { path: '/:id' })
  expect(client.capture).not.toHaveBeenCalled()
})

it('sends a held capture once when the SDK loads', () => {
  captureWhenLoaded('page_not_found', { path: '/:id' })
  POSTHOG_BROWSER_OPTIONS.loaded(client as unknown as PostHog)
  POSTHOG_BROWSER_OPTIONS.loaded(client as unknown as PostHog)
  expect(client.capture.mock.calls).toEqual([['page_not_found', { path: '/:id' }]])
})

it('drops what an admin does while viewing as a player', () => {
  setImpersonating(true)
  expect(dropWhileImpersonating(event())).toBeNull()
})

it('keeps the admin ending an impersonation', () => {
  setImpersonating(true)
  const stopped = { ...event(), event: 'admin_impersonation_stopped' }
  expect(dropWhileImpersonating(stopped)).toBe(stopped)
})
