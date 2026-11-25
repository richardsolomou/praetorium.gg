import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { compareText } from '../core/text'
import type { Deployment, Point, TerrainLayout } from '../contracts/terrain'
import type { VsDataMissionPack } from '../shared/vsData'
import { battlemasterGeometry } from './rulesTerrain'
import { joinKey } from '../core/text'

type BattlemasterCatalog = { layouts?: { id?: string }[] }
type BattlemasterSlot = { archetypeA?: string; archetypeB?: string; slotIndex?: number }
type BattlemasterLayout = {
  layout?: { chapterApprovedSlot?: BattlemasterSlot }
  deployment?: {
    name?: string
    board?: { widthIn?: number; heightIn?: number }
    zones?: { role?: string; points?: Point[] }[]
    territories?: { role?: string; points?: Point[] }[]
    objectives?: { center?: Point }[]
  }
}

function battlemasterSlots(directory: string) {
  const file = path.join(directory, 'catalog.json')
  const slots = new Map<string, string | null>()
  const deployments = new Map<string, Deployment | null>()
  if (!fs.existsSync(file)) return { slots, deployments }
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as BattlemasterCatalog
  for (const { id } of catalog.layouts ?? []) {
    if (!id?.match(/^terrain-[0-9a-f-]+$/)) continue
    const detailFile = path.join(directory, 'layouts', `${id}.json`)
    if (!fs.existsSync(detailFile)) continue
    const detail = JSON.parse(fs.readFileSync(detailFile, 'utf8')) as BattlemasterLayout
    const slot = detail.layout?.chapterApprovedSlot
    if (!slot?.archetypeA || !slot.archetypeB || ![1, 2, 3].includes(slot.slotIndex ?? 0)) continue
    const key = [...[slot.archetypeA, slot.archetypeB].sort(), slot.slotIndex].join('|')
    slots.set(key, slots.has(key) ? null : id)
    const deployment = detail.deployment
    if (deployment?.name && deployment.board?.widthIn === 60 && deployment.board.heightIn === 44) {
      const zones =
        deployment.zones?.flatMap((zone) =>
          (zone.role === 'attacker' || zone.role === 'defender') && zone.points?.length && zone.points.every(validPoint)
            ? [
                {
                  player: zone.role,
                  name: `${zone.role === 'attacker' ? 'Attacker' : 'Defender'} Deployment`,
                  colour: zone.role === 'attacker' ? '#ef4444' : '#3b82f6',
                  points: zone.points.map(boardPoint),
                },
              ]
            : [],
        ) ?? []
      const objectives =
        deployment.objectives?.flatMap((objective) =>
          objective.center && validPoint(objective.center) ? [boardPoint(objective.center)] : [],
        ) ?? []
      const territory = deployment.territories?.length === 1 ? deployment.territories[0] : undefined
      const territoryPoints = territory?.role === 'attacker' ? (territory.points ?? []) : []
      const attackerTerritory = territoryPoints.length >= 3 && territoryPoints.every(validPoint) ? territoryPoints.map(boardPoint) : null
      if (zones.length === 2 && objectives.length === 5) {
        const candidate: Deployment = { id: '', name: deployment.name, description: null, zones, attackerTerritory, objectives }
        const deploymentKey = joinKey(deployment.name)
        const previous = deployments.get(deploymentKey)
        deployments.set(deploymentKey, previous === undefined || JSON.stringify(previous) === JSON.stringify(candidate) ? candidate : null)
      }
    }
  }
  return { slots, deployments }
}

const validPoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)
const boardPoint = (point: Point): Point => ({ x: point.x + 30, y: 22 - point.y })

/** Each mission pack's deployments and layouts, by their VS Data IDs, drawn with Battlemaster's geometry for their names. */
export function missionTerrain(packs: readonly VsDataMissionPack[], battlemasterDirectory: string) {
  const deployments: Deployment[] = []
  const terrainLayouts: TerrainLayout[] = []
  const battlemaster = battlemasterSlots(battlemasterDirectory)
  // Combat Patrol's battlefields are its own (`combatPatrolTerrain`).
  for (const pack of packs.filter((candidate) => candidate.dispositions.length)) {
    for (const { id, name } of pack.deployments) {
      const geometry = battlemaster.deployments.get(joinKey(name))
      deployments.push({
        id,
        name,
        description: null,
        zones: geometry?.zones ?? [],
        attackerTerritory: geometry?.attackerTerritory ?? null,
        objectives: geometry?.objectives ?? [],
      })
    }
    for (const layout of pack.layouts) {
      const match = /^(.+) \/ (.+) - Layout ([ABC])$/.exec(layout.name)
      if (!match) continue
      const left = routeSlug(match[1]!)
      const right = routeSlug(match[2]!)
      const variant = match[3]!.charCodeAt(0) - 64
      const slotId = battlemaster.slots.get([...[left, right].sort(), variant].join('|'))
      const source = slotId ? battlemasterGeometry(battlemasterDirectory, slotId) : null
      const markers = source?.areas.flatMap((area) => area.markers) ?? []
      const geometry =
        source && ['AB', 'CD', 'EF', 'GH'].some((label) => markers.filter((marker) => marker.label === label).length !== 2)
          ? { ...source, areas: source.areas.map((area) => ({ ...area, markers: [] })) }
          : source
      terrainLayouts.push({
        id: layout.id,
        name: layout.name,
        description: null,
        matchupId: `${left}-vs-${right}`,
        variant,
        deploymentId: layout.deployments.length === 1 ? layout.deployments[0]! : null,
        pieces: [],
        geometry,
      })
    }
  }
  return {
    deployments: deployments.sort((a, b) => compareText(a.name, b.name)),
    terrainLayouts: terrainLayouts.sort((a, b) => compareText(a.name, b.name)),
  }
}
