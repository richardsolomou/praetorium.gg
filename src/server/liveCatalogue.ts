import fs from 'node:fs'
import path from 'node:path'

export function liveCatalogueRevision(root = process.env.CATALOGUE_LIVE_DIR) {
  if (!root) return null
  const file = path.join(root, 'current.json')
  if (!fs.existsSync(file)) return null
  const id = JSON.parse(fs.readFileSync(file, 'utf8')).id as unknown
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid live catalogue revision')
  return { id, directory: path.join(root, id) }
}
