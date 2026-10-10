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
