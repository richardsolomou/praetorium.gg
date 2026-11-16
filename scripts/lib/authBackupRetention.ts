export const authArchiveKey = /^backups\/auth\/production\/([0-9]{8}T[0-9]{6}Z)-[0-9a-f]{16}\.zip$/

const hour = 60 * 60 * 1000
const day = 24 * hour
// The Unix epoch fell on a Thursday, so this shift makes weeks start on Monday.
const mondayOffset = 3 * day

function archiveTime(key: string) {
  const stamp = authArchiveKey.exec(key)?.[1]
  return stamp
    ? Date.parse(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13)}`)
    : null
}

/** Auth archives outside the retention policy, newest first: every archive from the last 48 hours, the newest of each UTC day to 30 days, then the newest of each week. */
export function prunableAuthArchives(
  keys: string[],
  { now, written, spacetimeCreatedAt }: { now: Date; written: string; spacetimeCreatedAt: Date },
) {
  const archives = keys
    .flatMap((key) => {
      const time = archiveTime(key)
      return time === null ? [] : [{ key, time }]
    })
    .sort((a, b) => b.time - a.time)
  const periods = new Set<string>()
  return archives
    .filter(({ key, time }) => {
      const age = now.getTime() - time
      const period = age < 30 * day ? `day-${Math.floor(time / day)}` : `week-${Math.floor((time + mondayOffset) / (7 * day))}`
      const newestOfPeriod = !periods.has(period)
      periods.add(period)
      // An archive at or after the newest product backup is what a restore of that backup pairs with.
      return !newestOfPeriod && key !== written && time < spacetimeCreatedAt.getTime() && age >= 48 * hour
    })
    .map(({ key }) => key)
}
