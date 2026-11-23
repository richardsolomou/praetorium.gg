import fs from 'node:fs'
import path from 'node:path'

/** A Game Datacards mission pack, read only for the Combat Patrol battlefields VS Data does not publish yet. */
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
