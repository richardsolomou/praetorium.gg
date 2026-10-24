// eslint-disable-next-line import/default
import ReferenceDownloadWorker from './referenceDownload.worker?worker&inline'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { restoredReference } from './referenceRestore'
import type { DownloadMessage, DownloadRequest } from './referenceDownload'

/** Downloads and packs a new offline application off the main thread; aborting `signal` stops the worker. */
export function downloadInBackground(
  request: DownloadRequest,
  signal: AbortSignal,
  onReference: (data: OfflineReferenceData) => void,
): Promise<{ data: OfflineReferenceData; html: string; savedAt: number }> {
  return new Promise((resolve, reject) => {
    const worker = new ReferenceDownloadWorker()
    const finish = (error?: unknown) => {
      worker.terminate()
      signal.removeEventListener('abort', abort)
      if (error) reject(error)
    }
    const abort = () => finish(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data: message }: MessageEvent<DownloadMessage | { kind: 'failed' }>) => {
      if (message.kind === 'reference') onReference(restoredReference(message.parts))
      else if (message.kind === 'saved') {
        finish()
        resolve({ data: restoredReference(message.parts), html: message.html, savedAt: message.savedAt })
      } else finish(new Error('The reference download failed'))
    }
    worker.onerror = () => finish(new Error('The reference download worker failed'))
    worker.postMessage(request)
  })
}
