import { downloadReference, type DownloadRequest } from './referenceDownload'

self.onmessage = (event: MessageEvent<DownloadRequest>) => {
  downloadReference(event.data, (message) => self.postMessage(message), new AbortController().signal).then(
    () => self.close(),
    () => self.postMessage({ kind: 'failed' }),
  )
}
