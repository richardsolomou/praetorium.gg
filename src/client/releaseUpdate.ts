import type { QueryClient } from '@tanstack/react-query'
import { version } from '../../package.json'
import { releaseQuery } from './queries'

export function newerRelease(current: string, latest: string) {
  if (!/^\d+\.\d+\.\d+$/.test(current) || !/^\d+\.\d+\.\d+$/.test(latest)) return false
  const a = current.split('.').map(Number)
  const b = latest.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return b[index]! > a[index]!
  }
  return false
}

/** The deployed release this page's build predates, by the latest release check; a failed check counts as current. */
export function staleBuildRelease(client: QueryClient, current = version) {
  const state = client.getQueryState(releaseQuery().queryKey)
  return state?.status === 'success' && newerRelease(current, state.data!.version) ? state.data!.version : null
}

/** Asks the server again, since a tab woken from sleep can meet the new release before its next scheduled check. */
export async function checkedStaleBuildRelease(client: QueryClient) {
  await client.query({ ...releaseQuery(), staleTime: 0 }).catch(() => {})
  return staleBuildRelease(client)
}
