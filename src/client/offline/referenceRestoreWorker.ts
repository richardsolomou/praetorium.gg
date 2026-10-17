// Vite embeds the worker in the saved application.
// eslint-disable-next-line import/default
import ReferenceRestoreWorker from './referenceRestore.worker?worker&inline'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { SAVED_APPLICATION, restoredReference, type RestoredParts } from './referenceRestore'

/** Restores a saved or injected download off the main thread; `packed` defaults to the saved offline application. */
export function restoreReferenceInBackground(packed?: unknown): Promise<OfflineReferenceData | null> {
  return new Promise((resolve) => {
    const worker = new ReferenceRestoreWorker()
    const finish = (parts: RestoredParts) => {
      worker.terminate()
      resolve(parts ? restoredReference(parts) : null)
    }
    worker.onmessage = (event: MessageEvent<RestoredParts>) => finish(event.data)
    worker.onerror = () => finish(null)
    worker.postMessage({ packed, saved: new URL(SAVED_APPLICATION, location.href).href })
  })
}
