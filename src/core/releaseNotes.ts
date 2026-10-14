export type ReleaseNote = { version: string; changes: string[] }

/**
 * The newest app releases in a Changesets changelog that have any entries, each change
 * without its commit prefix.
 */
export function parseReleaseNotes(changelog: string, limit: number): ReleaseNote[] {
  const releases: ReleaseNote[] = []
  for (const line of changelog.split('\n')) {
    const heading = /^## (\d+\.\d+\.\d+)\s*$/.exec(line)
    if (heading) {
      releases.push({ version: heading[1]!, changes: [] })
      continue
    }
    const change = /^- (?:[0-9a-f]{7,40}: )?(.+)$/.exec(line)
    if (change && releases.length) releases.at(-1)!.changes.push(change[1]!.trim())
    else if (/^ {2}\S/.test(line) && releases.at(-1)?.changes.length) {
      const changes = releases.at(-1)!.changes
      changes[changes.length - 1] = `${changes.at(-1)} ${line.trim()}`
    }
  }
  return releases.filter((release) => release.changes.length).slice(0, limit)
}
