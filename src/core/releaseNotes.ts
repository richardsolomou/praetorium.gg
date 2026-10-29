/** One app release; `date` is the UTC day it shipped, `features` its minor or major changesets and `fixes` its patches. */
export type ReleaseNote = { version: string; date: string | null; features: string[]; fixes: string[] }

/**
 * The newest app releases in a Changesets changelog that have any entries, each change
 * without its commit prefix.
 */
export function parseReleaseNotes(changelog: string, limit: number): ReleaseNote[] {
  const releases: ReleaseNote[] = []
  let changes: string[] = []
  for (const line of changelog.split('\n')) {
    const heading = /^## (\d+\.\d+\.\d+)(?: \((\d{4}-\d{2}-\d{2})\))?\s*$/.exec(line)
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

/** Dates every undated release heading with `date`, as each release is versioned on the day it ships. */
export function dateReleaseHeadings(changelog: string, date: string) {
  return changelog.replace(/^## (\d+\.\d+\.\d+)[ \t]*$/gm, `## $1 (${date})`)
}
