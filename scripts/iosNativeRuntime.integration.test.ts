import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { iosNativeRuntime, verifyIosArchive } from './iosDeliveryPlan'

const repository = path.resolve(import.meta.dirname, '..')
let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'praetorium-ios-runtime-'))
  const files = execFileSync('git', ['ls-files', 'mobile'], { cwd: repository, encoding: 'utf8' }).trim().split('\n')
  for (const file of [...files, 'mobile/fingerprint.config.js', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    copyFileSync(path.join(repository, file), path.join(root, file))
  }
  symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir')
  symlinkSync(path.join(repository, 'mobile/node_modules'), path.join(root, 'mobile/node_modules'), 'dir')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function append(file: string) {
  const target = path.join(root, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, '// fingerprint probe\n', { flag: 'a' })
}

test('keeps the native runtime stable across checkout paths', () => {
  expect(iosNativeRuntime(root)).toEqual(iosNativeRuntime(repository))
})

test.each(['mobile/App.tsx', 'mobile/src/navigation.ts', 'mobile/watch/Tests/BattleSessionTests.swift', 'mobile/watch/.build/probe.swift'])(
  'keeps the installed native runtime for %s edits',
  (file) => {
    const baseline = iosNativeRuntime(root)
    append(file)
    expect(iosNativeRuntime(root)).toEqual(baseline)
  },
)

test.each(['mobile/watch/WatchStore.swift', 'mobile/modules/praetorium-web-swipe/ios/PraetoriumWebSwipeModule.swift'])(
  'changes the native runtime for %s edits',
  (file) => {
    const baseline = iosNativeRuntime(root)
    append(file)
    expect(iosNativeRuntime(root).runtimeVersion).not.toBe(baseline.runtimeVersion)
  },
)

test('changes the native runtime for native permission configuration', () => {
  const baseline = iosNativeRuntime(root)
  const file = path.join(root, 'mobile/app.json')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  config.expo.ios.infoPlist.NSCameraUsageDescription = 'Camera access'
  writeFileSync(file, JSON.stringify(config))
  expect(iosNativeRuntime(root).runtimeVersion).not.toBe(baseline.runtimeVersion)
})

test('changes the native runtime for build profile changes', () => {
  const baseline = iosNativeRuntime(root)
  const file = path.join(root, 'mobile/eas.json')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  config.build.production.ios = { buildConfiguration: 'Debug' }
  writeFileSync(file, JSON.stringify(config))
  expect(iosNativeRuntime(root).runtimeVersion).not.toBe(baseline.runtimeVersion)
})

test('preserves the native runtime while reporting a public version bump', () => {
  const baseline = iosNativeRuntime(root)
  const file = path.join(root, 'mobile/app.json')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  config.expo.version = '99.0.0'
  writeFileSync(file, JSON.stringify(config))
  expect(iosNativeRuntime(root)).toEqual({ ...baseline, appVersion: '99.0.0' })
})

test.runIf(process.platform === 'darwin').each([
  ['runtime-a', '1.0.0', null],
  ['wrong-runtime', '1.0.0', 'runtime does not match'],
  ['runtime-a', '2.0.0', 'app version does not match'],
])('checks the actual IPA runtime %s and version %s before upload', (runtimeVersion, appVersion, error) => {
  const archive = path.join(root, 'app.ipa')
  execFileSync('python3', [
    '-c',
    `
import plistlib, sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as archive:
    archive.writestr('Payload/Praetorium.app/Expo.plist', plistlib.dumps({'EXUpdatesRuntimeVersion': sys.argv[2]}, fmt=plistlib.FMT_BINARY))
    archive.writestr('Payload/Praetorium.app/Info.plist', plistlib.dumps({'CFBundleShortVersionString': sys.argv[3]}, fmt=plistlib.FMT_BINARY))
`,
    archive,
    runtimeVersion,
    appVersion,
  ])
  const verify = () => verifyIosArchive(archive, { runtimeVersion: 'runtime-a', appVersion: '1.0.0' })
  if (error) expect(verify).toThrow(error)
  else expect(verify).not.toThrow()
})
