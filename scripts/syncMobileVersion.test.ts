import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { syncMobileVersion } from './syncMobileVersion'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

it('synchronizes the Expo version while preserving native configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-version-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'mobile'))
  fs.writeFileSync(path.join(root, 'mobile/package.json'), JSON.stringify({ version: '1.4.0' }))
  const config = { expo: { version: '1.3.0', ios: { bundleIdentifier: 'gg.praetorium' }, plugins: ['expo-updates'] } }
  fs.writeFileSync(path.join(root, 'mobile/app.json'), JSON.stringify(config))

  syncMobileVersion(root)

  expect(JSON.parse(fs.readFileSync(path.join(root, 'mobile/app.json'), 'utf8'))).toEqual({
    expo: { ...config.expo, version: '1.4.0' },
  })
})
