import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { COMBAT_PATROL_MATCHUP_ID, type Deployment, type TerrainLayout } from '../contracts/terrain'
import { compareText } from '../core/text'
import type { VsDataMissionPack } from '../shared/vsData'
import { battlemasterGeometry } from './rulesTerrain'

const BOARD = { width: 44, height: 30 }
const point = z.object({ x: z.number().min(0).max(BOARD.width), y: z.number().min(0).max(BOARD.height) })
const polygon = z.array(point).min(3).max(12)
const sourceSchema = z.object({
  format: z.literal('praetorium.combat-patrol-deployments.v1'),
  deployments: z
    .array(z.object({ name: z.string().trim().min(1), attacker: polygon, defender: polygon, attackerTerritory: polygon }))
    .min(1)
    .max(6),
})
const COMBAT_PATROL_PACK = 'combat-patrol'
const catalogSchema = z.object({ layouts: z.array(z.object({ id: z.string(), name: z.string().optional() })) })

/**
 * The Combat Patrol battlefields: the pack's deployments and mission layouts, drawn with Battlemaster's
 * terrain and the zones and territories the pack's printed maps measure, in Battlemaster's landscape frame.
 */
export function combatPatrolTerrain(packs: readonly VsDataMissionPack[], battlemasterDirectory: string) {
  const directory = path.join(battlemasterDirectory, 'combat-patrol')
  const pack = packs.find((candidate) => candidate.id === COMBAT_PATROL_PACK)
  const sourceFile = path.join(directory, 'deployments.json')
  const catalogFile = path.join(directory, 'catalog.json')
  if (!pack || !fs.existsSync(sourceFile) || !fs.existsSync(catalogFile)) return { deployments: [], terrainLayouts: [] }
  const source = sourceSchema.parse(JSON.parse(fs.readFileSync(sourceFile, 'utf8')))
  const catalog = catalogSchema.parse(JSON.parse(fs.readFileSync(catalogFile, 'utf8')))

  const deployments = pack.deployments.flatMap(({ id, name }): Deployment[] => {
    const drawn = source.deployments.find((entry) => entry.name === name)
    if (!drawn) return []
    return [
      {
        id,
        name,
        description: null,
        zones: [
          { player: 'attacker', name: 'Attacker Deployment', colour: '#ef4444', points: drawn.attacker },
          { player: 'defender', name: 'Defender Deployment', colour: '#3b82f6', points: drawn.defender },
        ],
        attackerTerritory: drawn.attackerTerritory,
        objectives: [],
      },
    ]
  })
  const terrainLayouts = pack.layouts.flatMap(({ id, name, deployments: permitted }): TerrainLayout[] => {
    const letter = /^Mission Layout ([ABC])$/.exec(name)?.[1]
    const deployment = permitted.length === 1 ? deployments.find((entry) => entry.id === permitted[0]) : undefined
    const entries = catalog.layouts.filter((entry) => entry.name === `Layout ${letter}`)
    if (!letter || !deployment || entries.length !== 1) return []
    const geometry = battlemasterGeometry(directory, entries[0]!.id)
    if (geometry && (geometry.board.width !== BOARD.width || geometry.board.height !== BOARD.height)) return []
    return [
      {
        id,
        name,
        description: null,
        matchupId: COMBAT_PATROL_MATCHUP_ID,
        variant: letter.charCodeAt(0) - 64,
        deploymentId: deployment.id,
        pieces: [],
        // Battlemaster names its pieces after a kit's AB to GH letters, which the pack's maps letter differently.
        geometry: geometry && { ...geometry, areas: geometry.areas.map((area) => ({ ...area, markers: [] })) },
      },
    ]
  })
  return { deployments, terrainLayouts: terrainLayouts.sort((a, b) => compareText(a.name, b.name)) }
}
