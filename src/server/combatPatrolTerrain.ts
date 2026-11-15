import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { COMBAT_PATROL_MATCHUP_ID, type Deployment, type TerrainLayout } from '../contracts/terrain'
import { compareText } from '../core/text'
import { english, records } from '../shared/datacards'
import type { MissionPack } from './missionPacks'
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
const catalogSchema = z.object({ layouts: z.array(z.object({ id: z.string(), name: z.string().optional() })) })

/**
 * The Combat Patrol battlefields: the pack's deployments and mission layouts, drawn with Battlemaster's
 * terrain and the zones and territories the pack's printed maps measure, in Battlemaster's landscape frame.
 */
export function combatPatrolTerrain(packs: readonly MissionPack[], battlemasterDirectory: string) {
  const directory = path.join(battlemasterDirectory, 'combat-patrol')
  const pack = packs.find((candidate) => candidate.isCombatPatrol === true)
  const sourceFile = path.join(directory, 'deployments.json')
  const catalogFile = path.join(directory, 'catalog.json')
  if (!pack || !fs.existsSync(sourceFile) || !fs.existsSync(catalogFile)) return { deployments: [], terrainLayouts: [] }
  const source = sourceSchema.parse(JSON.parse(fs.readFileSync(sourceFile, 'utf8')))
  const catalog = catalogSchema.parse(JSON.parse(fs.readFileSync(catalogFile, 'utf8')))

  const deployments = records(pack, 'deployments').flatMap((raw): Deployment[] => {
    const name = english(raw.name)
    const drawn = source.deployments.find((entry) => entry.name === name)
    if (!name || !drawn || typeof raw.id !== 'string') return []
    return [
      {
        id: raw.id,
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
  const terrainLayouts = records(pack, 'layouts').flatMap((raw): TerrainLayout[] => {
    const name = english(raw.name)
    const letter = name && /^Mission Layout ([ABC])$/.exec(name)?.[1]
    const permitted = Array.isArray(raw.deployments) && raw.deployments.length === 1 ? raw.deployments[0] : null
    const deployment = deployments.find((entry) => entry.name === permitted)
    const entries = catalog.layouts.filter((entry) => entry.name === `Layout ${letter}`)
    if (!name || !letter || !deployment || typeof raw.id !== 'string' || entries.length !== 1) return []
    const geometry = battlemasterGeometry(directory, entries[0]!.id)
    if (geometry && (geometry.board.width !== BOARD.width || geometry.board.height !== BOARD.height)) return []
    return [
      {
        id: raw.id,
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
