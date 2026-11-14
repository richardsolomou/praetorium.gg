/** One app release; `date` is the UTC day it shipped, `features` its minor or major changesets and `fixes` its patches. */
export type ReleaseNote = { version: string; date: string | null; features: string[]; fixes: string[] }

/** How many release days What's new lists, enough to cover the weekly notice when it is a few days late. */
export const RELEASE_DAYS = 14

const releaseHeading = /^## (\d+\.\d+\.\d+)(?: \((\d{4}-\d{2}-\d{2})\))?\s*$/

/**
 * The newest app releases in a Changesets changelog that have any entries, each change
 * without its commit prefix.
 */
export function parseReleaseNotes(changelog: string, limit: number): ReleaseNote[] {
  const releases: ReleaseNote[] = []
  let changes: string[] = []
  for (const line of changelog.split('\n')) {
    const heading = releaseHeading.exec(line)
    if (heading) {
      releases.push({ version: heading[1]!, date: heading[2] ?? null, features: [], fixes: [] })
      changes = releases.at(-1)!.fixes
      continue
    }
    const release = releases.at(-1)
    if (!release) continue
    const section = /^### (Major|Minor|Patch) Changes/.exec(line)
    if (section) {
      changes = section[1] === 'Patch' ? release.fixes : release.features
      continue
    }
    const change = /^- (?:[0-9a-f]{7,40}: )?(.+)$/.exec(line)
    if (change) changes.push(change[1]!.trim())
    else if (/^ {2}\S/.test(line) && changes.length) changes[changes.length - 1] = `${changes.at(-1)} ${line.trim()}`
  }
  return releases.filter((release) => release.features.length + release.fixes.length).slice(0, limit)
}

/** Every release from the newest `days` release days that have any entries. */
export function recentReleaseNotes(changelog: string, days: number) {
  const notes = parseReleaseNotes(changelog, Infinity)
  const recent = new Set([...new Set(notes.map((note) => note.date))].slice(0, days))
  return notes.filter((note) => recent.has(note.date))
}

/**
 * The start of `changelog` up to the end of the oldest release `recentReleaseNotes` keeps, so
 * `recentReleaseNotes` reads the same releases from it without the history below.
 */
export function recentChangelog(changelog: string, days: number) {
  const oldest = recentReleaseNotes(changelog, days).at(-1)
  if (!oldest) return changelog
  const lines = changelog.split('\n')
  const start = lines.findIndex((line) => releaseHeading.exec(line)?.[1] === oldest.version)
  const end = lines.findIndex((line, index) => index > start && releaseHeading.test(line))
  return end === -1 ? changelog : lines.slice(0, end).join('\n')
}

/** Dates every undated release heading with `date`, as each release is versioned on the day it ships. */
export function dateReleaseHeadings(changelog: string, date: string) {
  return changelog.replace(/^## (\d+\.\d+\.\d+)[ \t]*$/gm, `## $1 (${date})`)
}
