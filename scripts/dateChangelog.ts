import fs from 'node:fs'
import { dateReleaseHeadings } from '../src/core/releaseNotes.ts'

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8')
fs.writeFileSync('CHANGELOG.md', dateReleaseHeadings(changelog, new Date().toISOString().slice(0, 10)))
