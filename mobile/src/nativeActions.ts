import { APP_URL } from './navigation'

const MAX_SHARE_TITLE_LENGTH = 160
const MAX_SHARE_URL_LENGTH = 2_048
const MAX_PRINT_HTML_LENGTH = 2_000_000

export type NativeActionRequest =
  | { kind: 'battle-active'; active: boolean }
  | { kind: 'haptic' }
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
  const capabilities = ['battle-active', 'haptic', 'print', 'share'];
  window.PraetoriumNative = Object.freeze({ bridgeVersion: 3, capabilities });
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
