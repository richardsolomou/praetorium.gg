import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { factionSchema, type MfmIndex } from '../shared/mfm'
export * from '../shared/mfm'
export function loadMfm(directory: string): MfmIndex | null {
  const points = path.join(directory, 'points', 'data')
  if (!fs.existsSync(points)) return null
  const factions = new Map<string, z.infer<typeof factionSchema>>()
  for (const file of fs.readdirSync(points).filter((name) => name.endsWith('.yaml') && name !== 'meta.yaml')) {
    const faction = factionSchema.parse(parse(fs.readFileSync(path.join(points, file), 'utf8')))
    if (factions.has(faction.slug)) throw new Error(`duplicate MFM faction ${faction.slug}`)
    factions.set(faction.slug, faction)
  }
  return factions
}
