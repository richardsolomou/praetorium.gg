import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { releaseQuery } from './queries'
import { deviceEngineRetired, newerRelease, staleBuildRelease } from './releaseUpdate'
it.each([
  ['0.101.1', '0.101.2', true],
  ['0.101.1', '0.102.0', true],
  ['0.101.1', '1.0.0', true],
  ['0.9.1', '0.10.0', true],
  ['0.101.1', '0.101.1', false],
  ['0.101.1', '0.101.0', false],
  ['1.0.0', '0.999.999', false],
  ['0.101.1', 'bad', false],
  ['bad', '0.101.2', false],
])('compares running %s with served %s: newer=%s', (current, latest, expected) => {
  expect(newerRelease(current, latest)).toBe(expected)
})

function servedRelease(version: string, deviceEngine?: string | null) {
  const client = new QueryClient()
  client.setQueryData(releaseQuery().queryKey, { version, deviceEngine })
  return client
}

it('names the deployed release a page built earlier is behind', () => {
  expect(staleBuildRelease(servedRelease('0.177.0'), '0.176.0')).toBe('0.177.0')
})

it('treats the deployed release as current for a page built from it', () => {
  expect(staleBuildRelease(servedRelease('0.177.0'), '0.177.0')).toBeNull()
})

it('treats a page as current before any release check answers', () => {
  expect(staleBuildRelease(new QueryClient(), '0.176.0')).toBeNull()
})

it('ignores an earlier answer once the latest release check has failed', async () => {
  const client = servedRelease('0.177.0')
  await client
    .query({
      queryKey: releaseQuery().queryKey,
      queryFn: () => Promise.reject(new Error('Release check failed')),
      staleTime: 0,
      retry: false,
    })
    .catch(() => {})
  expect(staleBuildRelease(client, '0.176.0')).toBeNull()
})

it('keeps the device engine through a release that left its code alone', () => {
  expect(deviceEngineRetired(servedRelease('0.177.0', '/assets/engine-a.js'), '0.176.0', '/assets/engine-a.js')).toBe(false)
})

it('retires the device engine once a release changes its code', () => {
  expect(deviceEngineRetired(servedRelease('0.177.0', '/assets/engine-b.js'), '0.176.0', '/assets/engine-a.js')).toBe(true)
})

it('retires the device engine when the release does not name its code', () => {
  expect(deviceEngineRetired(servedRelease('0.177.0'), '0.176.0', '/assets/engine-a.js')).toBe(true)
})

it('retires the device engine when the page cannot name its own code', () => {
  expect(deviceEngineRetired(servedRelease('0.177.0', '/assets/engine-a.js'), '0.176.0', null)).toBe(true)
})

it('keeps the device engine while the page is the deployed release', () => {
  expect(deviceEngineRetired(servedRelease('0.177.0', '/assets/engine-b.js'), '0.177.0', '/assets/engine-a.js')).toBe(false)
})
