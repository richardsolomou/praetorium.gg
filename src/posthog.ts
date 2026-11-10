import { posthog, type BeforeSendFn, type CaptureLogOptions, type PostHogConfig, type Properties } from 'posthog-js'
import { version } from '../package.json'
import { nativeBridgeVersion } from './client/nativeBridge'

const FEATURES = {
  '': 'home',
  rosters: 'rosters',
  battles: 'battles',
  leagues: 'tournaments',
  tournaments: 'tournaments',
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
  groups: 'groups',
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
  notifications: 'notifications',
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
 * Browser noise with nothing to act on: a cross-origin script hides its error, a resize observer skips a frame,
 * Outlook's link scanner rejects with its own message when it opens the page, and a browser abandons a page transition
 * when the tab hides or the window resizes. The SDK prefixes a DOMException's message with its name.
 */
const UNACTIONABLE_EXCEPTIONS = [
  /^Script error\.?$/,
  /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/,
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+$/,
  /^(InvalidStateError: )?Transition was aborted because of invalid state/,
  /^(InvalidStateError: )?Skipping view transition because viewport size changed$/,
]

export const dropUnactionableExceptions: BeforeSendFn = (event) => {
  const list: unknown = event.properties.$exception_list
  if (event.event !== '$exception' || !Array.isArray(list) || !list.length) return event
  const unactionable = list.every((exception: { value?: unknown }) =>
    UNACTIONABLE_EXCEPTIONS.some((pattern) => typeof exception.value === 'string' && pattern.test(exception.value)),
  )
  return unactionable ? null : event
}

/** Query parameters that hold a secret: reset and invite tokens, and an MCP consent request's OAuth state, PKCE challenge and signature. */
const PRIVATE_URL_PARAMS = ['token', 'state', 'code_challenge', 'sig']

// Stops at a quote or backslash so a value inside serialized JSON keeps the JSON valid.
const PRIVATE_URL_PARAM = new RegExp(`([?&](?:${PRIVATE_URL_PARAMS.join('|')})=)[^&#\\s"'\\\\]+`, 'g')

/** Masks the private parameters of every address in `text` the way the SDK masks them in event URLs. */
function maskPrivateUrlParams(text: string) {
  return text.replace(PRIVATE_URL_PARAM, '$1<MASKED>')
}

/** A server error flattened for the browser can take the page address as its stack, parameters and all. */
export const maskExceptionUrls: BeforeSendFn = (event) => {
  const list: unknown = event.properties.$exception_list
  if (event.event !== '$exception' || !list) return event
  const json = JSON.stringify(list)
  const masked = maskPrivateUrlParams(json)
  return masked === json ? event : { ...event, properties: { ...event.properties, $exception_list: JSON.parse(masked) } }
}

/**
 * Captured console output can quote the page address in its body and attributes. The SDK adds `url.full` after this
 * hook, unmasked, unless the record already has one, so it is set here; a record buffered before the logs script
 * loaded gets the address at send time.
 */
export const maskLogUrls = (record: CaptureLogOptions): CaptureLogOptions => ({
  ...record,
  body: maskPrivateUrlParams(record.body),
  attributes: {
    ...Object.fromEntries(
      Object.entries(record.attributes ?? {}).map(([key, value]) => [key, typeof value === 'string' ? maskPrivateUrlParams(value) : value]),
    ),
    ...(typeof window === 'undefined' ? {} : { 'url.full': maskPrivateUrlParams(window.location.href) }),
  },
})

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

export const POSTHOG_SERVICE = { name: 'praetorium', version, environment: import.meta.env.MODE }

export const POSTHOG_BROWSER_OPTIONS = {
  capture_exceptions: true,
  capture_performance: true,
  capture_dead_clicks: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: PRIVATE_URL_PARAMS,
  session_recording: { maskAllInputs: true },
  before_send: [dropWhileImpersonating, dropUnactionableExceptions, maskExceptionUrls, browserEventContext],
  // Replaces the logs options the integration builds from `service`, so it names the service again.
  logs: {
    serviceName: POSTHOG_SERVICE.name,
    serviceVersion: POSTHOG_SERVICE.version,
    environment: POSTHOG_SERVICE.environment,
    beforeSend: maskLogUrls,
  },
  loaded: (client) => {
    for (const [event, properties] of held.splice(0)) client.capture(event, properties)
  },
} satisfies Partial<PostHogConfig>
