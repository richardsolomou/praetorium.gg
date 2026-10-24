import { posthog, type BeforeSendFn, type PostHogConfig, type Properties } from 'posthog-js'
import { nativeBridgeVersion } from './client/nativeBridge'

const FEATURES = {
  '': 'home',
  rosters: 'rosters',
  battles: 'battles',
  leagues: 'leagues',
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
  before_send: browserEventContext,
  loaded: (client) => {
    for (const [event, properties] of held.splice(0)) client.capture(event, properties)
  },
} satisfies Partial<PostHogConfig>
