import fs from 'node:fs'
import { RELEASE_DAYS, archiveChangelog } from '../src/core/releaseNotes.ts'

// What's new imports CHANGELOG.md whole, so it keeps only the releases What's new lists.
const { current, archived } = archiveChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'), RELEASE_DAYS)
fs.writeFileSync('CHANGELOG.md', current)
fs.mkdirSync('changelog', { recursive: true })
for (const [month, releases] of archived) {
  const file = `changelog/${month}.md`
  const older = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^# .*\n+/, '') : ''
  fs.writeFileSync(file, [`# praetorium ${month}\n`, `${releases.trimEnd()}\n`, older].filter(Boolean).join('\n'))
}
