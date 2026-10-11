import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { referenceQuery } from './shared'

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
beforeEach(() => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: { savedAt: 1, queries: [{ key: ['rule-index'], data: 'Saved rules' }] } })
  vi.stubGlobal('navigator', { onLine: true })
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
