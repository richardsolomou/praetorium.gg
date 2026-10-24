import { beforeEach, expect, it, vi } from 'vitest'
import type { DownloadRequest } from './referenceDownload'

const workers = vi.hoisted(() => [] as FakeWorker[])

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  constructor() {
    workers.push(this)
  }
  postMessage() {}
  terminate() {
    this.terminated = true
  }
  message(data: unknown) {
    this.onmessage?.({ data })
  }
}

vi.mock('./referenceDownload.worker?worker&inline', () => ({ default: FakeWorker }))

const { downloadInBackground } = await import('./referenceDownloadWorker')
const parts = { reference: { version: 1, revision: 'a', savedAt: 1, search: {}, css: '', logo: '' }, queries: [] }
const request = {} as DownloadRequest

function start(signal = new AbortController().signal) {
  const download = downloadInBackground(request, signal, () => {})
  return { download, worker: workers.at(-1)! }
}

beforeEach(() => {
  workers.length = 0
})

it('rejects a download the worker reports as failed', async () => {
  const { download, worker } = start()
  worker.message({ kind: 'failed' })
  await expect(download).rejects.toThrow('download failed')
})

it('rejects when the worker itself fails', async () => {
  const { download, worker } = start()
  worker.onerror?.()
  await expect(download).rejects.toThrow('worker failed')
})

it('rejects an aborted download', async () => {
  const abort = new AbortController()
  const { download } = start(abort.signal)
  abort.abort(new Error('stopped'))
  await expect(download).rejects.toThrow('stopped')
})

it('stops the worker when the download is aborted', async () => {
  const abort = new AbortController()
  const { download, worker } = start(abort.signal)
  abort.abort()
  await download.catch(() => {})
  expect(worker.terminated).toBe(true)
})

it('stops the worker once the download is saved', async () => {
  const { download, worker } = start()
  worker.message({ kind: 'saved', parts, html: '<html>', savedAt: 1 })
  await download
  expect(worker.terminated).toBe(true)
})

it('passes a reported reference to the page before the download is saved', () => {
  const onReference = vi.fn()
  void downloadInBackground(request, new AbortController().signal, onReference)
  workers.at(-1)!.message({ kind: 'reference', parts })
  expect(onReference).toHaveBeenCalledOnce()
})
