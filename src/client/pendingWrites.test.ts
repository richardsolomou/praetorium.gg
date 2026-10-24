import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { holdingReload, pendingWriteMiddleware, writesPending } from './pendingWrites'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => (resolve = settle))
  return { promise, resolve }
}

it('counts a write in flight as pending', async () => {
  const write = deferred()
  const held = holdingReload(write.promise)
  expect(writesPending(new QueryClient())).toBe(true)
  write.resolve()
  await held
})

it('stops counting a write once it settles', async () => {
  await holdingReload(Promise.resolve())
  expect(writesPending(new QueryClient())).toBe(false)
})

it('stops counting a write once it fails', async () => {
  await holdingReload(Promise.reject(new Error('refused'))).catch(() => {})
  expect(writesPending(new QueryClient())).toBe(false)
})

it('counts a running React Query mutation as pending', async () => {
  const client = new QueryClient()
  const write = deferred()
  const running = client
    .getMutationCache()
    .build(client, { mutationFn: () => write.promise })
    .execute(undefined)
  expect(writesPending(client)).toBe(true)
  write.resolve()
  await running
})

const callServerFunction = (method: 'GET' | 'POST', next: () => Promise<unknown>) =>
  (pendingWriteMiddleware.options.client as unknown as (options: { method: string; next: () => Promise<unknown> }) => Promise<unknown>)({
    method,
    next,
  })

it('counts a server function post as pending', async () => {
  const write = deferred()
  const sent = callServerFunction('POST', () => write.promise)
  expect(writesPending(new QueryClient())).toBe(true)
  write.resolve()
  await sent
})

it('leaves a server function read out of pending writes', async () => {
  const read = deferred()
  const reading = callServerFunction('GET', () => read.promise)
  expect(writesPending(new QueryClient())).toBe(false)
  read.resolve()
  await reading
})
