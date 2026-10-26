// Vite embeds the worker in the saved application.
// eslint-disable-next-line import/default
import ReferenceRestoreWorker from './referenceRestore.worker?worker&inline'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { SAVED_APPLICATION, restoredReference, type RestoredParts } from './referenceRestore'
import { workerAnswer } from '../workerAnswer'

/** Restores a saved or injected download off the main thread; `packed` defaults to the saved offline application. */
export async function restoreReferenceInBackground(packed?: unknown): Promise<OfflineReferenceData | null> {
  const worker = new ReferenceRestoreWorker()
  const parts = await workerAnswer<RestoredParts>(worker, { packed, saved: new URL(SAVED_APPLICATION, location.href).href })
    .catch(() => null)
    .finally(() => worker.terminate())
  return parts ? restoredReference(parts) : null
}
