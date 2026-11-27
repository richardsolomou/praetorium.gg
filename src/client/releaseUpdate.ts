import type { QueryClient } from '@tanstack/react-query'
import { version } from '../../package.json'
import { deviceEngineFile } from '../shared/deviceEngine'
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

/** The device engine file of the build this page loaded, which keeps the import map it opened with. */
const pageDeviceEngine = () =>
  typeof document === 'undefined' ? null : deviceEngineFile(document.querySelector('script[type="importmap"]')?.textContent ?? undefined)

/**
 * Whether this page must stop answering from its device engine: a newer release changed the engine's code, or either
 * side cannot name it, so the page's answers could differ from the server's.
 */
export function deviceEngineRetired(client: QueryClient, current = version, own = pageDeviceEngine()) {
  if (!staleBuildRelease(client, current)) return false
  const served = client.getQueryData(releaseQuery().queryKey)?.deviceEngine
  return !own || served !== own
}

/** Asks the server again, since a tab woken from sleep can meet the new release before its next scheduled check. */
export async function checkedStaleBuildRelease(client: QueryClient) {
  await client.query({ ...releaseQuery(), staleTime: 0 }).catch(() => {})
  return staleBuildRelease(client)
}
