import { execFileSync } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { runningLocalDevPreview } from './localDevPreview.ts'

const platform = process.argv[2] === 'android' ? 'android' : 'ios'
const worktree = await realpath(process.cwd())
const preview = await runningLocalDevPreview(worktree)
if (!preview?.ready) throw new Error('Start this worktree with just dev before opening the mobile app')
// The dev server redirects any other host to its own address, which the shell then treats as an external site, so the
// emulator reaches that same address through a reverse port forward rather than its 10.0.2.2 host alias.
if (platform === 'android') {
  const { port } = new URL(preview.publicUrl)
  const adb = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb') : 'adb'
  execFileSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'ignore' })
}
console.log(preview.publicUrl)
