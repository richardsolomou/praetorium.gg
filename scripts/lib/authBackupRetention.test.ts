import { expect, it } from 'vitest'
import { prunableAuthArchives } from './authBackupRetention'

const now = new Date('2026-11-16T12:17:00Z')
const hour = 60 * 60 * 1000
const key = (hoursAgo: number, id = '0'.repeat(16)) => {
  const stamp = new Date(now.getTime() - hoursAgo * hour).toISOString().replaceAll('-', '').replaceAll(':', '').slice(0, 15) + 'Z'
  return `backups/auth/production/${stamp}-${id}.zip`
}
const hourly = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => key(from + index))
const options = { now, written: key(0), spacetimeCreatedAt: new Date(now.getTime() - 6 * hour) }

it('keeps every archive from the last 48 hours', () => {
  expect(prunableAuthArchives(hourly(0, 47), options)).toEqual([])
})

it('keeps only the newest archive of each day from two to thirty days old', () => {
  // 2026-11-13 runs from 84.28 to 60.28 hours before `now`.
  expect(prunableAuthArchives([key(60.5), key(70), key(84)], options)).toEqual([key(70), key(84)])
})

it('keeps only the newest archive of each week beyond thirty days', () => {
  // Monday 2026-10-05 starts 1020.28 hours before `now`; Monday 2026-10-12 starts 852.28 hours before it.
  expect(prunableAuthArchives([key(900), key(950), key(1000), key(1030)], options)).toEqual([key(950), key(1000)])
})

it('never prunes the archive it just wrote', () => {
  expect(prunableAuthArchives([key(60.5), key(70), key(84)], { ...options, written: key(70) })).toEqual([key(84)])
})

it('never prunes an archive at or after the newest product backup', () => {
  expect(
    prunableAuthArchives([key(70), key(72), key(84)], { ...options, spacetimeCreatedAt: new Date(now.getTime() - 72 * hour) }),
  ).toEqual([key(84)])
})

it('never prunes keys outside the auth archive pattern', () => {
  expect(prunableAuthArchives(['backups/auth/production/latest.json', `${key(70)}.partial`], options)).toEqual([])
})
