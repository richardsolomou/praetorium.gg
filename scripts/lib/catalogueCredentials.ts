import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { git } from './git'

const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']

export function loadCatalogueCredentials(root: string) {
  const load = (directory: string) => {
    for (const name of ['.env.local', '.env']) {
      const file = path.join(directory, name)
      if (!fs.existsSync(file)) continue
      for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, 'utf8')))) {
        if (names.includes(key)) process.env[key] ??= value
      }
    }
  }

  load(root)
  if (names.every((name) => process.env[name] !== undefined) || !fs.existsSync(path.join(root, '.git'))) return
  const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim()
  const main = path.dirname(common)
  if (main !== root) load(main)
}
