import fs from 'node:fs'
import path from 'node:path'

/**
 * A mission pack as the datacards source writes one, parsed once.
 *
 * Three separate things are read out of these files — what each payout on a card
 * asks for, the twists a pack offers, and the ceilings it puts on scoring — and each
 * of them used to open and parse every pack for itself. The packs are large enough
 * that reading them three times is a second and a third copy of the same object
 * graph on every boot and every catalogue refresh, so they are read here once and
 * handed to whoever needs them.
 */
export type MissionPack = Record<string, unknown>

/** Every pack under `<directory>/missions`, or none where there is no such directory. */
export function readMissionPacks(directory: string): MissionPack[] {
  const missions = path.join(directory, 'missions')
  if (!fs.existsSync(missions)) return []
  return fs
    .readdirSync(missions)
    .filter((entry) => entry.endsWith('.json'))
    .flatMap((fileName): MissionPack[] => {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(missions, fileName), 'utf8'))
      return parsed && typeof parsed === 'object' ? [parsed as MissionPack] : []
    })
}

/**
 * The pack names everything in eight languages. This product is in one, and a value
 * that is only a string is taken as it is rather than skipped.
 */
export function english(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (!value || typeof value !== 'object') return null
  const translated = (value as Record<string, unknown>).en
  return typeof translated === 'string' ? translated.trim() || null : null
}
