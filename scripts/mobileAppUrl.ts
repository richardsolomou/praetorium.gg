import { realpath } from 'node:fs/promises'
import { runningLocalDevPreview } from './localDevPreview.ts'
import { mobileAppUrl } from './lib/mobileAppUrl'

const platform = process.argv[2] === 'android' ? 'android' : 'ios'
const worktree = await realpath(process.cwd())
const preview = await runningLocalDevPreview(worktree)
if (!preview?.ready) throw new Error('Start this worktree with just dev before opening the mobile app')
console.log(mobileAppUrl(preview.publicUrl, platform))
