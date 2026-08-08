import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The instance's signing key, shared by better-auth's sessions and the realtime
 * tokens. Set `AUTH_SECRET` to manage it elsewhere; otherwise it is generated
 * once beside the database, because losing it signs everyone out.
 */
export function sessionSecret(directory: string) {
  const configured = process.env.AUTH_SECRET?.trim()
  if (configured) return configured
  const file = path.join(directory, 'session.secret')
  const generated = crypto.randomBytes(32).toString('base64url')
  try {
    fs.writeFileSync(file, generated, { mode: 0o600, flag: 'wx' })
    return generated
  } catch {
    return fs.readFileSync(file, 'utf8').trim()
  }
}
