import { NATIVE_BRIDGE_SCRIPT } from '../mobile/src/nativeActions'

export const NATIVE_BROWSER_BRIDGE_SCRIPT = `${NATIVE_BRIDGE_SCRIPT}
(() => {
  window.PraetoriumNative = Object.freeze({ ...window.PraetoriumNative, capabilities: window.PraetoriumNative.capabilities.filter((capability) => capability !== 'local-state') });
  const postMessage = window.ReactNativeWebView.postMessage;
  window.PraetoriumAppSnapshot = JSON.parse(localStorage.getItem('e2e-native-app-snapshot') || 'null') || undefined;
  window.ReactNativeWebView.postMessage = (message) => {
    const request = JSON.parse(message);
    if (request.type === 'native-app-snapshot') {
      localStorage.setItem('e2e-native-app-snapshot', JSON.stringify(request.snapshot));
      queueMicrotask(() => window.dispatchEvent(new CustomEvent('praetorium-native-app-snapshot', { detail: { id: request.id, saved: true } })));
    } else if (request.type === 'native-offline-save') {
      queueMicrotask(() => window.dispatchEvent(new CustomEvent('praetorium-native-offline', { detail: { id: request.id, saved: false } })));
    } else postMessage(message);
  };
})();`

/** A shell that ignores every message, for pages that only need to run as the app. */
export const NATIVE_SHELL_SCRIPT = `window.ReactNativeWebView = { postMessage: () => {} };
${NATIVE_BROWSER_BRIDGE_SCRIPT}`

/**
 * The shell's saved-work store as `mobile/src/localStateStorage.ts` keeps it: a write lands only at
 * the revision it was read at, and every answer arrives after a round trip.
 */
export const NATIVE_LOCAL_STATE_SCRIPT = `window.ReactNativeWebView = { postMessage: (message) => {
  const request = JSON.parse(message);
  const answer = (name, detail) => setTimeout(() => window.dispatchEvent(new CustomEvent(name, { detail })), 150);
  if (request.type === 'native-app-snapshot') return answer('praetorium-native-app-snapshot', { id: request.id, saved: true });
  if (request.type === 'native-offline-save') return answer('praetorium-native-offline', { id: request.id, saved: false });
  if (request.type !== 'native-local-state') return;
  const key = 'e2e-native-local-state:' + request.owner;
  const previous = JSON.parse(localStorage.getItem(key) || 'null') || { epoch: crypto.randomUUID(), state: null };
  let stored = previous;
  if ('state' in request && previous.epoch === request.epoch && (previous.state?.revision ?? 0) === request.expectedRevision)
    stored = request.state ? { epoch: request.epoch, state: request.state } : { epoch: crypto.randomUUID(), state: null };
  localStorage.setItem(key, JSON.stringify(stored));
  answer('praetorium-native-local-state', { id: request.id, ...stored, saved: !('state' in request) || stored !== previous });
} };
${NATIVE_BRIDGE_SCRIPT}`
