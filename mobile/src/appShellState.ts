import { APP_URL, classifyNavigation, initialApplicationUrl } from './navigation'
import type { NativeAuthCallback } from './nativeAuth'

type AuthCallback = Extract<NativeAuthCallback, { kind: 'success' }>

export type AppShellCommand =
  | { kind: 'auth'; callback: AuthCallback }
  | { kind: 'auth-navigation'; url: string }
  | { kind: 'navigation'; url: string }

export type AppShellState = {
  sourceUrl: string | null
  lastInternalUrl: string
  initialUrlPending: boolean
  ready: boolean
  loadStarted: boolean
  loadFailed: boolean
  pendingAuth: AuthCallback | null
  pendingAuthNavigation: string | null
  pendingNavigation: string | null
  delivering: AppShellCommand | null
  renderKey: number
}

export type AppShellRenderState = Pick<AppShellState, 'sourceUrl' | 'renderKey'>

export function appShellRenderState(state: AppShellState): AppShellRenderState {
  return { sourceUrl: state.sourceUrl, renderKey: state.renderKey }
}

export function appShellRenderChanged(previous: AppShellState, next: AppShellState) {
  return previous.sourceUrl !== next.sourceUrl || previous.renderKey !== next.renderKey
}

export function initialAppShellState(): AppShellState {
  return {
    sourceUrl: null,
    lastInternalUrl: APP_URL,
    initialUrlPending: true,
    ready: false,
    loadStarted: false,
    loadFailed: false,
    pendingAuth: null,
    pendingAuthNavigation: null,
    pendingNavigation: null,
    delivering: null,
    renderKey: 0,
  }
}

export function initialUrlReceived(state: AppShellState, url: string | null): AppShellState {
  if (!state.initialUrlPending) return state
  const sourceUrl = initialApplicationUrl(url)
  return { ...state, sourceUrl, lastInternalUrl: sourceUrl, initialUrlPending: false }
}

export function warmUrlReceived(state: AppShellState, url: string): AppShellState {
  const decision = classifyNavigation(url)
  if (decision.kind !== 'internal') {
    return state.sourceUrl ? { ...state, initialUrlPending: false } : initialUrlReceived(state, null)
  }
  if (!state.sourceUrl) {
    return { ...state, sourceUrl: decision.url, lastInternalUrl: decision.url, initialUrlPending: false }
  }
  return { ...state, initialUrlPending: false, pendingNavigation: decision.url }
}

export function authReceived(state: AppShellState, callback: AuthCallback): AppShellState {
  return {
    ...state,
    sourceUrl: state.sourceUrl ?? APP_URL,
    initialUrlPending: false,
    pendingAuth: callback,
  }
}

export function initialAuthReceived(state: AppShellState, callback: AuthCallback): AppShellState {
  return state.initialUrlPending ? authReceived(state, callback) : state
}

export function webNavigationChanged(state: AppShellState, url: string): AppShellState {
  const decision = classifyNavigation(url)
  return decision.kind === 'internal' ? { ...state, lastInternalUrl: decision.url } : state
}

export function webLoadStarted(state: AppShellState): AppShellState {
  return { ...state, ready: false, loadStarted: true, loadFailed: false }
}

function restoreDelivery(state: AppShellState): AppShellState {
  if (state.delivering?.kind === 'auth') {
    return { ...state, pendingAuth: state.pendingAuth ?? state.delivering.callback, delivering: null }
  }
  if (state.delivering?.kind === 'auth-navigation') {
    return { ...state, pendingAuthNavigation: state.delivering.url, delivering: null }
  }
  if (state.delivering?.kind === 'navigation') {
    return { ...state, pendingNavigation: state.pendingNavigation ?? state.delivering.url, delivering: null }
  }
  return state
}

export function webLoadFailed(state: AppShellState): AppShellState {
  return { ...restoreDelivery(state), ready: false, loadFailed: true }
}

export function webLoadFinished(state: AppShellState, url: string): AppShellState {
  return { ...webNavigationChanged(state, url), ready: false }
}

export function confirmWebLoadSucceeded(state: AppShellState): AppShellState {
  return !state.loadStarted || state.loadFailed ? state : { ...state, ready: true, loadStarted: false, delivering: null }
}

export function drainAppShell(state: AppShellState): { state: AppShellState; command: AppShellCommand | null } {
  if (!state.ready || state.delivering) return { state, command: null }
  if (state.pendingAuth) {
    const command: AppShellCommand = { kind: 'auth', callback: state.pendingAuth }
    return { state: { ...state, pendingAuth: null, delivering: command }, command }
  }
  if (state.pendingAuthNavigation) {
    const command: AppShellCommand = { kind: 'auth-navigation', url: state.pendingAuthNavigation }
    return { state: { ...state, pendingAuthNavigation: null, delivering: command }, command }
  }
  if (state.pendingNavigation) {
    const command: AppShellCommand = { kind: 'navigation', url: state.pendingNavigation }
    return { state: { ...state, pendingNavigation: null, delivering: command }, command }
  }
  return { state, command: null }
}

export function authDeliveryFailed(state: AppShellState): AppShellState {
  return state.delivering?.kind === 'auth' ? { ...state, delivering: null } : state
}

export function authDeliverySucceeded(state: AppShellState): AppShellState {
  if (state.delivering?.kind !== 'auth') return state
  return {
    ...state,
    delivering: { kind: 'auth-navigation', url: new URL(state.delivering.callback.next, APP_URL).href },
  }
}

export function rendererTerminated(state: AppShellState): AppShellState {
  const restored = (() => {
    if (state.delivering?.kind === 'auth') {
      return {
        ...state,
        pendingAuthNavigation: new URL(state.delivering.callback.next, APP_URL).href,
        delivering: null,
      }
    }
    if (state.delivering?.kind === 'auth-navigation') {
      return { ...state, pendingAuthNavigation: state.delivering.url, delivering: null }
    }
    return restoreDelivery(state)
  })()
  return {
    ...restored,
    ready: false,
    loadStarted: false,
    sourceUrl: restored.lastInternalUrl,
    initialUrlPending: false,
    renderKey: restored.renderKey + 1,
  }
}
