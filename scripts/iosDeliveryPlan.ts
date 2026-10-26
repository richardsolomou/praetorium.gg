import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { z } from 'zod'
import { iosDeliveryFingerprint } from './iosDelivery.ts'
import { isEntryPoint } from './lib/entryPoint.ts'
import { stepOutput } from './lib/stepOutput.ts'

const runtimeSchema = z.object({ runtimeVersion: z.string().min(1), appVersion: z.string().min(1) })
const payloadSchema = runtimeSchema.extend({ inputFingerprint: z.string().min(1) })
const deploymentSchema = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/), payload: payloadSchema })
type Payload = z.infer<typeof payloadSchema>
type Deployment = z.infer<typeof deploymentSchema>

function isAncestor(root: string, older: string, newer: string) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd: root, encoding: 'utf8' })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`Cannot compare iOS revisions: ${result.stderr}`, { cause: result.error })
}

export function iosNativeRuntime(root: string) {
  const mobile = path.join(root, 'mobile')
  const require = createRequire(path.join(mobile, 'package.json'))
  const { getConfig } = require('expo/config') as { getConfig: (projectRoot: string) => { exp: unknown } }
  const config = z
    .object({
      version: z.string().min(1),
      runtimeVersion: z.object({ policy: z.literal('fingerprint') }),
      ios: z
        .object({ version: z.string().optional(), runtimeVersion: z.object({ policy: z.literal('fingerprint') }).optional() })
        .optional(),
    })
    .parse(getConfig(mobile).exp)
  const resolved = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(mobile, 'node_modules/expo-updates/bin/cli.js'), 'runtimeversion:resolve', '--platform', 'ios', '--workflow', 'managed'],
      {
        cwd: mobile,
        encoding: 'utf8',
        maxBuffer: 8_000_000,
      },
    ),
  ) as { runtimeVersion: unknown }
  return runtimeSchema.parse({ runtimeVersion: resolved.runtimeVersion, appVersion: config.ios?.version ?? config.version })
}

export function planIosDelivery(
  root: string,
  revision: string,
  current: Payload,
  binary: Deployment | null,
  update: Deployment | null,
  forceBuild: boolean,
) {
  for (const previous of [binary, update]) {
    if (!previous || previous.sha === revision) continue
    if (isAncestor(root, revision, previous.sha)) return { build: false, update: false }
    if (!isAncestor(root, previous.sha, revision))
      throw new Error(`iOS revision ${revision} does not contain delivered revision ${previous.sha}`)
  }
  const build = forceBuild || binary?.payload.runtimeVersion !== current.runtimeVersion || binary.payload.appVersion !== current.appVersion
  return {
    build,
    update:
      build || update?.payload.runtimeVersion !== current.runtimeVersion || update.payload.inputFingerprint !== current.inputFingerprint,
  }
}

function github(...args: string[]) {
  return execFileSync('gh', ['api', ...args], { encoding: 'utf8' }).trim()
}

function environment(channel: string, kind: 'binary' | 'update') {
  return `mobile-ios-${channel}${kind === 'binary' ? '-binary' : ''}`
}

function delivered(channel: string, kind: 'binary' | 'update') {
  const records = z
    .array(z.unknown())
    .parse(JSON.parse(github(`repos/${process.env.GITHUB_REPOSITORY}/deployments?environment=${environment(channel, kind)}&per_page=1`)))
  if (!records.length) return null
  // The old stable receipt predates per-channel runtime and upload records.
  if (kind === 'update' && channel === 'stable' && z.object({ payload: z.object({}).strict() }).safeParse(records[0]).success) return null
  return deploymentSchema.parse(records[0])
}

export function verifyIosArchive(archive: string, expected: z.infer<typeof runtimeSchema>) {
  const entry = (file: string) => execFileSync('unzip', ['-p', archive, `Payload/Praetorium.app/${file}`])
  const read = (file: string, key: string) =>
    execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', '-'], {
      input: entry(file),
      encoding: 'utf8',
    }).trim()
  const configuredRuntime = read('Expo.plist', 'EXUpdatesRuntimeVersion')
  const runtimeVersion =
    configuredRuntime === 'file:fingerprint' ? entry('EXUpdates.bundle/fingerprint').toString().trim() : configuredRuntime
  if (runtimeVersion !== expected.runtimeVersion) throw new Error('Built iOS runtime does not match the delivery plan')
  if (read('Info.plist', 'CFBundleShortVersionString') !== expected.appVersion)
    throw new Error('Built iOS app version does not match the delivery plan')
}

if (isEntryPoint(import.meta.url)) {
  const [command, channel] = process.argv.slice(2)
  const root = process.cwd()
  if (command === 'verify' && channel) {
    verifyIosArchive(
      channel,
      runtimeSchema.parse({ runtimeVersion: process.env.IOS_RUNTIME_VERSION, appVersion: process.env.IOS_APP_VERSION }),
    )
  } else if (command === 'native-changed' && channel) {
    stepOutput({ changed: JSON.stringify(iosNativeRuntime(root)) !== JSON.stringify(iosNativeRuntime(path.resolve(channel))) })
  } else {
    if (channel !== 'canary' && channel !== 'stable') throw new Error('Expected the canary or stable iOS channel')
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const main = process.env.GITHUB_REF === 'refs/heads/main'
    if (main && !isAncestor(root, revision, 'refs/remotes/origin/main')) {
      throw new Error(`iOS revision ${revision} is not in origin/main; select its branch for a canary build`)
    }
    if (command === 'plan') {
      const payload = { ...iosNativeRuntime(root), inputFingerprint: iosDeliveryFingerprint(root, revision) }
      const plan = main
        ? planIosDelivery(
            root,
            revision,
            payload,
            delivered(channel, 'binary'),
            delivered(channel, 'update'),
            process.env.FORCE_IOS_BUILD === 'true',
          )
        : { build: true, update: false }
      stepOutput({ ...payload, ...plan })
    } else if (command === 'record') {
      const kind = process.argv[4]
      if (kind !== 'binary' && kind !== 'update') throw new Error('Expected a binary or update receipt')
      if (!main) throw new Error('Only main deliveries can be recorded')
      const payload = payloadSchema.parse({
        runtimeVersion: process.env.IOS_RUNTIME_VERSION,
        appVersion: process.env.IOS_APP_VERSION,
        inputFingerprint: process.env.IOS_INPUT_FINGERPRINT,
      })
      const record = z.object({ id: z.number() }).parse(
        JSON.parse(
          execFileSync('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}/deployments`, '--method', 'POST', '--input', '-'], {
            encoding: 'utf8',
            input: JSON.stringify({
              ref: revision,
              environment: environment(channel, kind),
              auto_merge: false,
              required_contexts: [],
              production_environment: channel === 'stable',
              payload,
            }),
          }),
        ),
      )
      github(
        `repos/${process.env.GITHUB_REPOSITORY}/deployments/${record.id}/statuses`,
        '--method',
        'POST',
        '-f',
        'state=success',
        '-f',
        'environment_url=https://praetorium.gg',
        '-f',
        `log_url=${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      )
    } else {
      throw new Error('Usage: iosDeliveryPlan.ts plan|record <canary|stable> [binary|update], or native-changed <base-root>')
    }
  }
}
