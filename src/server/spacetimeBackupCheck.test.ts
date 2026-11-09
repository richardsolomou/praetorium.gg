import { beforeEach, expect, test, vi } from 'vitest'
import { reportServerFailure } from '../adapters/posthog'
import { checkSpacetimeBackup } from './spacetimeBackupCheck'

vi.mock('../adapters/posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adapters/posthog')>()),
  reportServerFailure: vi.fn(),
}))

const production = { APP_URL: 'https://praetorium.gg', SPACETIME_INTERNAL_HOST: 'database' }
const now = Date.parse('2026-11-09T14:00:00.000Z')
const published = (createdAt: string) => ({ get: vi.fn(async () => new TextEncoder().encode(JSON.stringify({ createdAt }))) })
const reported = () => vi.mocked(reportServerFailure).mock.calls.map(([record]) => record.event)

beforeEach(() => vi.mocked(reportServerFailure).mockClear())

test('stays quiet through one missed run', async () => {
  await checkSpacetimeBackup(production, published('2026-11-09T01:30:00.000Z'), now)
  expect(reported()).toEqual([])
})

test('reports a backup older than two runs', async () => {
  await checkSpacetimeBackup(production, published('2026-11-09T00:30:00.000Z'), now)
  expect(reported()).toEqual(['spacetime_backup_stale'])
})

test('reports an unreadable publish date as stale', async () => {
  await checkSpacetimeBackup(production, published('not a date'), now)
  expect(reported()).toEqual(['spacetime_backup_stale'])
})

test('reports a missing backup', async () => {
  await checkSpacetimeBackup(production, { get: vi.fn(async () => null) }, now)
  expect(reported()).toEqual(['spacetime_backup_check_failed'])
})

test('reads the production database backup pointer', async () => {
  const backups = published('2026-11-09T12:00:00.000Z')
  await checkSpacetimeBackup(production, backups, now)
  expect(backups.get).toHaveBeenCalledWith('database/backups/latest.json')
})

test('leaves previews alone', async () => {
  const backups = { get: vi.fn(async () => null) }
  await checkSpacetimeBackup({ APP_URL: 'https://pr-1.praetorium.gg' }, backups, now)
  expect(reported()).toEqual([])
})
