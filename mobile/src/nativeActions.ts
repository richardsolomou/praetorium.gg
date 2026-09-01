import { APP_URL, classifyNavigation } from './navigation'

const MAX_SHARE_TITLE_LENGTH = 160
const MAX_SHARE_URL_LENGTH = 2_048
const MAX_OPEN_WINDOW_URL_LENGTH = 2_048
const MAX_PRINT_HTML_LENGTH = 2_000_000

export type NativeActionRequest =
  | { kind: 'battle-active'; active: boolean }
  | { kind: 'haptic' }
  | { kind: 'open-window'; url: string }
  | { kind: 'print'; html: string }
  | { kind: 'share'; title?: string; url: string }

export function parseNativeActionRequest(message: string): NativeActionRequest | null {
  try {
    const value = JSON.parse(message) as Record<string, unknown>
    if (value.version !== 3) return null
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
  const capabilities = ['app-navigation', 'battle-active', 'haptic', 'open-window', 'print', 'share'];
  const history = { canGoBack: false };
  window.PraetoriumNative = Object.freeze({ bridgeVersion: 3, capabilities, history });
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

export function nativeHistoryStateScript(canGoBack: boolean) {
  return `if (window.PraetoriumNative?.history) window.PraetoriumNative.history.canGoBack = ${canGoBack}; true;`
}
