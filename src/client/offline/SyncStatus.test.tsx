// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalState } from '../../contracts/localState'
import { localWorkKey } from '../queries/queryKeys'
import { SyncStatus } from './SyncStatus'

const local = vi.hoisted(() => ({ state: null as LocalState | null }))

vi.mock('../queries/account', () => ({
  meQuery: () => ({ queryKey: ['me'], queryFn: async () => ({ id: 'player' }), staleTime: Infinity }),
}))
vi.mock('./localRuntime', () => ({
  localEngine: () => ({ storage: { read: async () => local.state } }),
  localOwner: () => ({ id: 'player' }),
  restoreLocalWork: async () => {},
  syncLocalWork: async () => {},
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pending = (count: number): LocalState =>
  ({
    version: 1,
    owner: 'player',
    epoch: 'epoch',
    revision: count,
    documents: {},
    operations: Array.from({ length: count }, (_, index) => ({ id: `operation-${index}`, resource: 'roster:a', status: 'pending' })),
  }) as unknown as LocalState

let root: Root
let client: QueryClient
const banner = () => document.body.querySelector('output')?.textContent ?? null

beforeEach(async () => {
  vi.useFakeTimers()
  local.state = pending(1)
  client = new QueryClient()
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <SyncStatus />
      </QueryClientProvider>,
    ),
  )
  // Query results reach components on a zero-delay timer, so the account and its saved work load before any test's clock starts.
  await act(async () => vi.advanceTimersByTimeAsync(0))
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.useRealTimers()
})

it('stays quiet while an online change has waited less than ten seconds', async () => {
  await act(async () => vi.advanceTimersByTimeAsync(9_000))
  expect(banner()).toBeNull()
})

it('shows an online change still waiting after ten seconds', async () => {
  await act(async () => vi.advanceTimersByTimeAsync(10_000))
  expect(banner()).toContain('1 change waiting to sync')
})

it('hides the status once the waiting change syncs', async () => {
  await act(async () => vi.advanceTimersByTimeAsync(10_000))
  local.state = pending(0)
  await act(async () => {
    client.setQueryData(localWorkKey(), local.state)
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(banner()).toBeNull()
})
