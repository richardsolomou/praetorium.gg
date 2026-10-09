import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'mobile/.simulator-derived/watch')
mkdirSync(output, { recursive: true })
const simctl = (...args: string[]) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim()
const { runtimes } = JSON.parse(simctl('list', 'runtimes', '--json')) as {
  runtimes: { identifier: string; name: string; isAvailable: boolean }[]
}
const runtime = runtimes.findLast((entry) => entry.isAvailable && entry.name.startsWith('watchOS'))
if (!runtime) throw new Error('Install a watchOS simulator runtime with: xcodebuild -downloadPlatform watchOS')
const { devices } = JSON.parse(simctl('list', 'devices', '--json')) as {
  devices: Record<string, { udid: string; name: string; state: string }[]>
}
const candidates = devices[runtime.identifier] ?? []
const requested = process.env.WATCH_SIMULATOR_UDID
const device = requested
  ? candidates.find((entry) => entry.udid === requested)
  : candidates.find((entry) => entry.name === 'Praetorium Watch 46mm')
if (requested && !device) throw new Error('WATCH_SIMULATOR_UDID must identify an available watchOS simulator')
const id =
  device?.udid ??
  simctl('create', 'Praetorium Watch 46mm', 'com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-10-46mm', runtime.identifier)
if (device?.state !== 'Booted') simctl('boot', id)
simctl('bootstatus', id, '-b')
execFileSync('pnpm', ['--dir', 'mobile', 'exec', 'expo', 'prebuild', '--platform', 'ios', '--no-install'], { cwd: root, stdio: 'inherit' })
const log = path.join(output, 'build.log')
const fd = openSync(log, 'w')
try {
  execFileSync(
    'xcodebuild',
    [
      '-project',
      'mobile/ios/Praetorium.xcodeproj',
      '-target',
      'PraetoriumWatch',
      '-configuration',
      'Debug',
      '-sdk',
      'watchsimulator',
      'ARCHS=arm64',
      `CONFIGURATION_BUILD_DIR=${output}`,
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ],
    { cwd: root, stdio: ['ignore', fd, fd] },
  )
} catch (cause) {
  throw new Error(`Watch build failed. Read ${log}`, { cause })
} finally {
  closeSync(fd)
}
simctl('install', id, path.join(output, 'PraetoriumWatch.app'))
const developer = execFileSync('xcode-select', ['--print-path'], { encoding: 'utf8' }).trim()
const simulator = path.join(developer, 'Applications/Simulator.app')
if (existsSync(simulator)) execFileSync('open', ['-a', simulator, '--args', '-CurrentDeviceUDID', id])
for (const [page, name] of ['battle', 'objectives', 'reminders'].entries()) {
  simctl('launch', '--terminate-running-process', id, 'gg.praetorium.watch', '--demo', '--page', String(page))
  await setTimeout(2000)
  simctl('io', id, 'screenshot', path.join(output, `${name}.png`))
}
simctl('launch', '--terminate-running-process', id, 'gg.praetorium.watch', '--demo')
console.log(`Watch simulator: ${id}`)
console.log(`Demo screenshots: ${output}`)
