import { posthog, type BeforeSendFn, type PostHogConfig, type Properties } from 'posthog-js'
import { nativeBridgeVersion } from './client/nativeBridge'

const FEATURES = {
  '': 'home',
  rosters: 'rosters',
  battles: 'battles',
  leagues: 'leagues',
  tournaments: 'leagues',
  factions: 'factions',
  rules: 'rules',
  missions: 'missions',
  'mission-packs': 'missions',
  'force-dispositions': 'force-dispositions',
  simulator: 'simulator',
  docs: 'docs',
  friends: 'friends',
  invite: 'friends',
  users: 'players',
  leaderboard: 'players',
  'sign-in': 'account',
  signin: 'account',
  'reset-password': 'account',
  'delete-account': 'account',
  'native-auth': 'account',
  profile: 'account',
  admin: 'admin',
  clubs: 'clubs',
  join: 'battles',
  collection: 'collection',
  'whats-new': 'whats-new',
  'mission-matchups': 'missions',
  search: 'search',
  guides: 'docs',
  'mcp-consent': 'agents',
  'data-updates': 'data-updates',
  support: 'support',
  feedback: 'support',
  privacy: 'legal',
  terms: 'legal',
  sources: 'legal',
  more: 'navigation',
} as const

export function telemetryFeature(pathname: string) {
  const area = pathname.split('/')[1] ?? ''
  return Object.hasOwn(FEATURES, area) ? FEATURES[area as keyof typeof FEATURES] : 'other'
}

export const browserEventContext: BeforeSendFn = (event) => {
  if (typeof window === 'undefined') return event
  let pathname = typeof event.properties.$pathname === 'string' ? event.properties.$pathname : window.location.pathname
  if (event.event === '$web_vitals' && typeof event.properties.$current_url === 'string') {
    try {
      pathname = new URL(event.properties.$current_url).pathname
    } catch {
      // A malformed metric URL must not interrupt capture.
    }
  }
  return {
    ...event,
    properties: {
      ...event.properties,
      feature: telemetryFeature(pathname),
      surface: nativeBridgeVersion() === undefined ? 'web' : 'native',
    },
  }
}

/**
 * Browser noise with nothing to act on: a cross-origin script hides its error, a resize observer skips a frame, and
 * Outlook's link scanner rejects with its own message when it opens the page.
 */
const UNACTIONABLE_EXCEPTIONS = [
  /^Script error\.?$/,
  /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/,
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+$/,
]

export const dropUnactionableExceptions: BeforeSendFn = (event) => {
  const list: unknown = event.properties.$exception_list
  if (event.event !== '$exception' || !Array.isArray(list) || !list.length) return event
  const unactionable = list.every((exception: { value?: unknown }) =>
    UNACTIONABLE_EXCEPTIONS.some((pattern) => typeof exception.value === 'string' && pattern.test(exception.value)),
  )
  return unactionable ? null : event
}

let impersonating = false

/** While an admin views as a player, the app is the admin's, so it must not count as the player's or the admin's use. */
export function setImpersonating(value: boolean) {
  impersonating = value
}

export const dropWhileImpersonating: BeforeSendFn = (event) =>
  impersonating && event?.event !== 'admin_impersonation_stopped' ? null : event

const held: [event: string, properties: Properties][] = []

/** Captures now or once the SDK loads: the provider initialises it in an effect, after its children's effects on the first render. */
export function captureWhenLoaded(event: string, properties: Properties) {
  if (posthog.__loaded) posthog.capture(event, properties)
  else held.push([event, properties])
}

export const POSTHOG_BROWSER_OPTIONS = {
  capture_exceptions: true,
  capture_performance: true,
  capture_dead_clicks: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['token'],
  session_recording: { maskAllInputs: true },
  before_send: [dropWhileImpersonating, dropUnactionableExceptions, browserEventContext],
  loaded: (client) => {
    for (const [event, properties] of held.splice(0)) client.capture(event, properties)
  },
} satisfies Partial<PostHogConfig>
