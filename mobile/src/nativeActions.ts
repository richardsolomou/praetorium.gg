import { parseSavedReference, type SavedReference } from './offlineReference'
import { APP_URL, classifyNavigation } from './navigation'
import { MAX_APP_SNAPSHOT_BYTES, parseAppSnapshot, type AppSnapshot } from '../../src/contracts/appSnapshot'
import { MAX_LOCAL_STATE_BYTES, parseLocalState, type LocalState } from '../../src/contracts/localState'

import { MAX_WATCH_MESSAGE_BYTES, parseWatchBattle, type WatchBattle } from '../../src/contracts/watchBattle'

const MAX_SHARE_TITLE_LENGTH = 160
const MAX_SHARE_URL_LENGTH = 2_048
const MAX_OPEN_WINDOW_URL_LENGTH = 2_048
const MAX_PRINT_HTML_LENGTH = 2_000_000

export type NativeActionRequest =
  | { kind: 'export-work'; id: string; state: LocalState }
  | { kind: 'local-state'; owner: string; id: string; state?: LocalState | null; epoch?: string; expectedRevision?: number }
  | { kind: 'watch-battle'; snapshot: WatchBattle | null }
  | { kind: 'app-snapshot'; id: string; snapshot: AppSnapshot | null }
  | { kind: 'offline-save'; id: string; reference: SavedReference }
  | { kind: 'back-gesture'; enabled: boolean }
  | { kind: 'battle-active'; active: boolean }
  | { kind: 'haptic' }
  | { kind: 'open-window'; url: string }
  | { kind: 'print'; html: string }
  | { kind: 'push'; id: string; prompt: boolean }
  | { kind: 'share'; title?: string; url: string }

/** The shell's answer to a `push` request, as the web application reads it. */
export type NativePushAnswer =
  | { status: 'granted'; token: string; platform: 'ios' | 'android' }
  | { status: 'denied' | 'undetermined' | 'unavailable' }

export function nativePushAnswerScript(id: string, answer: NativePushAnswer) {
  const detail = JSON.stringify({ id, ...answer })
  return `window.dispatchEvent(new CustomEvent('praetorium-native-push', { detail: ${detail} })); true;`
}

export function parseNativeActionRequest(message: string): NativeActionRequest | null {
  try {
    const value = JSON.parse(message) as Record<string, unknown>
    if (value.version !== 3) return null
    if (
      value.type === 'native-export-work' &&
      typeof value.id === 'string' &&
      /^[\w-]{1,64}$/.test(value.id) &&
      message.length <= MAX_LOCAL_STATE_BYTES + 2048
    ) {
      const state = parseLocalState(value.state)
      return state ? { kind: 'export-work', id: value.id, state } : null
    }
    if (
      value.type === 'native-local-state' &&
      typeof value.owner === 'string' &&
      value.owner.length > 0 &&
      value.owner.length <= 128 &&
      typeof value.id === 'string' &&
      /^[\w-]{1,64}$/.test(value.id) &&
      message.length <= MAX_LOCAL_STATE_BYTES + 2048
    ) {
      if (!('state' in value)) return { kind: 'local-state', owner: value.owner, id: value.id }
      const state = value.state === null ? null : parseLocalState(value.state)
      if (
        (state?.owner === value.owner || value.state === null) &&
        typeof value.epoch === 'string' &&
        /^[\w-]{1,64}$/.test(value.epoch) &&
        Number.isSafeInteger(value.expectedRevision) &&
        Number(value.expectedRevision) >= 0
      )
        return {
          kind: 'local-state',
          owner: value.owner,
          id: value.id,
          state,
          epoch: value.epoch,
          expectedRevision: Number(value.expectedRevision),
        }
      return null
    }
    if (value.type === 'native-watch-battle' && new TextEncoder().encode(message).length <= MAX_WATCH_MESSAGE_BYTES) {
      const snapshot = value.snapshot === null ? null : parseWatchBattle(value.snapshot)
      return value.snapshot === null || snapshot ? { kind: 'watch-battle', snapshot } : null
    }
    if (
      value.type === 'native-app-snapshot' &&
      typeof value.id === 'string' &&
      /^[\w-]{1,64}$/.test(value.id) &&
      message.length <= MAX_APP_SNAPSHOT_BYTES + 1024
    ) {
      const snapshot = value.snapshot === null ? null : parseAppSnapshot(value.snapshot)
      return value.snapshot === null || snapshot ? { kind: 'app-snapshot', id: value.id, snapshot } : null
    }
    if (value.type === 'native-offline-save' && typeof value.id === 'string' && /^[\w-]{1,64}$/.test(value.id)) {
      const reference = parseSavedReference({ html: value.html, savedAt: value.savedAt })
      return reference ? { kind: 'offline-save', id: value.id, reference } : null
    }
    if (value.type === 'native-back-gesture' && typeof value.enabled === 'boolean') {
      return { kind: 'back-gesture', enabled: value.enabled }
    }
    if (value.type === 'native-battle-active' && typeof value.active === 'boolean') {
      return { kind: 'battle-active', active: value.active }
    }
    if (value.type === 'native-haptic') return { kind: 'haptic' }
    if (value.type === 'native-open-window' && typeof value.url === 'string' && value.url.length <= MAX_OPEN_WINDOW_URL_LENGTH) {
      const decision = classifyNavigation(value.url)
      return decision.kind === 'blocked' ? null : { kind: 'open-window', url: decision.url }
    }
    if (value.type === 'native-print' && typeof value.html === 'string' && value.html.length <= MAX_PRINT_HTML_LENGTH) {
      return { kind: 'print', html: value.html }
    }
    if (
      value.type === 'native-push' &&
      typeof value.id === 'string' &&
      /^[\w-]{1,64}$/.test(value.id) &&
      typeof value.prompt === 'boolean'
    ) {
      return { kind: 'push', id: value.id, prompt: value.prompt }
    }
    if (value.type === 'native-share' && typeof value.url === 'string' && value.url.length <= MAX_SHARE_URL_LENGTH) {
      const url = new URL(value.url)
      if (url.origin !== APP_URL || url.username || url.password) return null
      if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > MAX_SHARE_TITLE_LENGTH)) return null
      return { kind: 'share', url: url.href, ...(typeof value.title === 'string' ? { title: value.title } : {}) }
    }
    return null
  } catch {
    return null
  }
}

export const NATIVE_BRIDGE_SCRIPT = `(() => {
  const capabilities = ['app-navigation', 'app-snapshot', 'local-state', 'back-gesture', 'battle-active', 'github-auth', 'haptic', 'notifications', 'offline-reference', 'open-window', 'print', 'share'];
  window.PraetoriumNative = Object.freeze({ bridgeVersion: 3, capabilities });
  const disableZoom = () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return false;
    viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    return true;
  };
  if (!disableZoom()) document.addEventListener('DOMContentLoaded', disableZoom, { once: true });
  const markNativeApp = () => {
    if (!document.documentElement) return false;
    document.documentElement.dataset.nativeApp = 'true';
    return true;
  };
  if (!markNativeApp()) {
    const observer = new MutationObserver(() => {
      if (!markNativeApp()) return;
      observer.disconnect();
    });
    observer.observe(document, { childList: true });
  }
  const requestOpenWindow = (value) => {
    try {
      const url = new URL(String(value), document.baseURI).href;
      window.ReactNativeWebView.postMessage(JSON.stringify({ version: 3, type: 'native-open-window', url }));
      return true;
    } catch {
      return false;
    }
  };
  const browserOpen = window.open.bind(window);
  window.open = (url, target, features) => {
    const name = target === undefined ? '_blank' : String(target).trim().toLowerCase();
    if (url !== undefined && name === '_blank' && requestOpenWindow(url)) return null;
    return browserOpen(url, target, features);
  };
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const source = event.target;
    const anchor = source instanceof Element ? source.closest('a[target]') : null;
    if (!anchor || anchor.target.trim().toLowerCase() !== '_blank' || !requestOpenWindow(anchor.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.print = () => {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll('script, iframe').forEach((element) => element.remove());
    const head = root.querySelector('head');
    if (head) {
      const base = document.createElement('base');
      base.href = document.baseURI;
      head.prepend(base);
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ version: 3, type: 'native-print', html: '<!DOCTYPE html>' + root.outerHTML }));
  };
})(); true;`

export function nativeWatchCapabilityScript(enabled: boolean) {
  return `(() => {
    if (!window.PraetoriumNative) return;
    const capabilities = window.PraetoriumNative.capabilities.filter(value => value !== 'watch-battle');
    ${enabled ? "capabilities.push('watch-battle');" : ''}
    window.PraetoriumNative = Object.freeze({ ...window.PraetoriumNative, capabilities });
    window.dispatchEvent(new CustomEvent('praetorium-native-capabilities'));
  })(); true;`
}
