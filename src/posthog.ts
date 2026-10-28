import { posthog, type BeforeSendFn, type PostHogConfig, type PostHogInterface, type Properties } from 'posthog-js'
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

const held: ((client: PostHogInterface) => void)[] = []

/**
 * Sends now or once the SDK loads: the provider initialises it in an effect, after its children's effects, error
 * boundaries, and router render callbacks on the first render, and the SDK drops whatever arrives before then.
 */
export function whenLoaded(send: (client: PostHogInterface) => void) {
  if (posthog.__loaded) send(posthog)
  else held.push(send)
}

export const captureWhenLoaded = (event: string, properties: Properties) => whenLoaded((client) => client.capture(event, properties))

export const POSTHOG_BROWSER_OPTIONS = {
  capture_exceptions: true,
  capture_performance: true,
  capture_dead_clicks: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['token'],
  session_recording: { maskAllInputs: true },
  before_send: [dropUnactionableExceptions, browserEventContext],
  loaded: (client) => {
    for (const send of held.splice(0)) send(client)
  },
} satisfies Partial<PostHogConfig>
