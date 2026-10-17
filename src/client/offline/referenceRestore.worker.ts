import { restoreParts } from './referenceRestore'

self.onmessage = async (event: MessageEvent<{ packed?: unknown; saved: string }>) => {
  self.postMessage(await restoreParts(event.data.packed, event.data.saved).catch(() => null))
}
