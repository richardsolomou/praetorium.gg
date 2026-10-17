import fs from 'node:fs'
import path from 'node:path'
import { isEntryPoint } from './lib/entryPoint.ts'

export function syncMobileVersion(root: string) {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'mobile/package.json'), 'utf8')) as { version: string }
  const target = path.join(root, 'mobile/app.json')
  const config = JSON.parse(fs.readFileSync(target, 'utf8')) as { expo: { version: string } }
  config.expo.version = version
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`)
}

if (isEntryPoint(import.meta.url)) {
  syncMobileVersion(process.cwd())
}
