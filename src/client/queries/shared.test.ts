import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { referenceQuery } from './shared'
import { loadPart } from '../offline/runtime'
import { savedDownload } from '../offline/savedReference.fixtures'

vi.mock('../offline/referenceStore', async () => (await import('../offline/savedReference.fixtures')).storedPartReader)

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
beforeEach(async () => {
  const saved = savedDownload([{ key: ['rule-index'], data: 'Saved rules' }])
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  // A page has decoded the core it reads once the download is restored.
  await loadPart(saved.download.reference.core)
})
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
})
it('shows saved rules immediately and replaces them after background revalidation', async () => {
  let finish!: (data: string) => void
  const online = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  const observer = new QueryObserver(client, referenceQuery(['rule-index'], online))
  const data: (string | undefined)[] = []
  const unsubscribe = observer.subscribe((result) => data.push(result.data))
  expect(observer.getCurrentResult().data).toBe('Saved rules')
  await vi.waitFor(() => expect(online).toHaveBeenCalled())
  finish('Current rules')
  await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('Current rules'))
  expect(data).not.toContain(undefined)
  unsubscribe()
})
it('keeps saved rules visible when revalidation fails', async () => {
  const observer = new QueryObserver(
    client,
    referenceQuery(['rule-index'], () => Promise.reject(new Error('Unreachable'))),
  )
  const unsubscribe = observer.subscribe(() => {})
  await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false))
  expect(observer.getCurrentResult().data).toBe('Saved rules')
  unsubscribe()
})
it('does not replace fresher screen data with saved initial data', () => {
  client.setQueryData(['rule-index'], 'Current rules')
  const observer = new QueryObserver(
    client,
    referenceQuery(['rule-index'], () => Promise.resolve('Server rules')),
  )
  expect(observer.getCurrentResult().data).toBe('Current rules')
})
it('retains newer screen data when a later revalidation fails', async () => {
  client.setQueryData(['rule-index'], 'Current rules', { updatedAt: 1 })
  const observer = new QueryObserver(
    client,
    referenceQuery(['rule-index'], () => Promise.reject(new Error('Unreachable'))),
  )
  const unsubscribe = observer.subscribe(() => {})
  await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false))
  expect(observer.getCurrentResult().data).toBe('Current rules')
  unsubscribe()
})
