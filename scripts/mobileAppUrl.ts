import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { inspectLocalDevPreview, localControlPort, readLocalDevPreview } from './localDevPreview.ts'
import { mobileAppUrl } from './lib/mobileAppUrl'

const platform = process.argv[2] === 'android' ? 'android' : 'ios'
const worktree = await realpath(process.cwd())
const saved = readLocalDevPreview(path.join(worktree, 'data-dev/active-preview.json'))
const preview = await inspectLocalDevPreview(worktree, saved?.controlPort ?? localControlPort(worktree), saved?.token)
if (!preview?.ready) throw new Error('Start this worktree with just dev before opening the mobile app')
console.log(mobileAppUrl(preview.publicUrl, platform))
