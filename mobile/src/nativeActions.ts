import { APP_URL, classifyNavigation } from './navigation'

const MAX_SHARE_TITLE_LENGTH = 160
const MAX_SHARE_URL_LENGTH = 2_048
const MAX_OPEN_WINDOW_URL_LENGTH = 2_048
const MAX_PRINT_HTML_LENGTH = 2_000_000

export type NativeActionRequest =
  | { kind: 'account'; name?: string; image?: string }
  | { kind: 'account-menu'; open: boolean }
  | { kind: 'navigation'; title: string; backUrl?: string; preferHistory: boolean }
  | { kind: 'back-gesture'; enabled: boolean }
  | { kind: 'battle-active'; active: boolean }
  | { kind: 'haptic' }
  | { kind: 'open-window'; url: string }
  | { kind: 'print'; html: string }
  | { kind: 'share'; title?: string; url: string }

export function parseNativeActionRequest(message: string): NativeActionRequest | null {
  try {
    const value = JSON.parse(message) as Record<string, unknown>
    if (value.version !== 3) return null
    if (value.type === 'native-account-menu' && typeof value.open === 'boolean') return { kind: 'account-menu', open: value.open }
    if (value.type === 'native-account') {
      if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 100)) return null
      if (value.image !== undefined) {
        if (typeof value.image !== 'string' || value.image.length > 2_048) return null
        const image = classifyNavigation(new URL(value.image, APP_URL).href)
        if (image.kind === 'blocked' || !image.url.startsWith('http')) return null
        return { kind: 'account', ...(typeof value.name === 'string' ? { name: value.name } : {}), image: image.url }
      }
      return { kind: 'account', ...(typeof value.name === 'string' ? { name: value.name } : {}) }
    }
    if (value.type === 'native-navigation' && typeof value.title === 'string' && value.title.length <= 80) {
      if (value.backUrl === undefined) return { kind: 'navigation', title: value.title, preferHistory: false }
      if (typeof value.backUrl !== 'string' || typeof value.preferHistory !== 'boolean') return null
      const back = classifyNavigation(new URL(value.backUrl, APP_URL).href)
      if (back.kind !== 'internal') return null
      return { kind: 'navigation', title: value.title, backUrl: back.url, preferHistory: value.preferHistory }
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
  const capabilities = ['account', 'app-navigation', 'back-gesture', 'battle-active', 'haptic', 'open-window', 'print', 'share'];
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
    document.documentElement.dataset.nativeShell = 'true';
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
