import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'
import { compareText } from '../core/text'
import type { Deployment, Point, TerrainLayout } from '../contracts/terrain'
import { english, type MissionPack } from './missionPacks'
import { battlemasterGeometry } from './rulesTerrain'
import { joinKey } from '../shared/rulesSource'

type BattlemasterCatalog = { layouts?: { id?: string }[] }
type BattlemasterSlot = { archetypeA?: string; archetypeB?: string; slotIndex?: number }
type BattlemasterLayout = {
  layout?: { chapterApprovedSlot?: BattlemasterSlot }
  deployment?: {
    name?: string
    board?: { widthIn?: number; heightIn?: number }
    zones?: { role?: string; points?: Point[] }[]
    objectives?: { center?: Point }[]
  }
}
type RecordValue = Record<string, unknown>
const records = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.filter((entry): entry is RecordValue => Boolean(entry) && typeof entry === 'object') : []

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
      if (zones.length === 2 && objectives.length === 5) {
        const candidate: Deployment = { id: '', name: deployment.name, description: null, zones, objectives }
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

export function terrainFromDatacards(packs: readonly MissionPack[], battlemasterDirectory: string) {
  const deployments: Deployment[] = []
  const terrainLayouts: TerrainLayout[] = []
  const battlemaster = battlemasterSlots(battlemasterDirectory)
  for (const pack of packs) {
    if (pack.isCombatPatrol === true) continue
    const deploymentIds = new Map<string, string>()
    for (const raw of records(pack.deployments)) {
      const name = english(raw.name)
      if (!name || typeof raw.id !== 'string') continue
      deploymentIds.set(name, raw.id)
      const geometry = battlemaster.deployments.get(joinKey(name))
      deployments.push({
        id: raw.id,
        name,
        description: null,
        zones: geometry?.zones ?? [],
        objectives: geometry?.objectives ?? [],
      })
    }
    for (const raw of records(pack.layouts)) {
      const name = english(raw.name)
      if (!name || typeof raw.id !== 'string') continue
      const match = /^(.+) \/ (.+) - Layout ([ABC])$/.exec(name)
      if (!match) continue
      const left = routeSlug(match[1]!)
      const right = routeSlug(match[2]!)
      const variant = match[3]!.charCodeAt(0) - 64
      const slotId = battlemaster.slots.get([...[left, right].sort(), variant].join('|'))
      const permitted = Array.isArray(raw.deployments) ? raw.deployments : []
      const deploymentId = permitted.length === 1 && typeof permitted[0] === 'string' ? (deploymentIds.get(permitted[0]) ?? null) : null
      const geometry = slotId ? battlemasterGeometry(battlemasterDirectory, slotId) : null
      const markers = geometry?.areas.flatMap((area) => area.markers) ?? []
      if (geometry && ['AB', 'CD', 'EF', 'GH'].some((label) => markers.filter((marker) => marker.label === label).length !== 2)) {
        for (const area of geometry.areas) area.markers = []
      }
      terrainLayouts.push({
        id: raw.id,
        name,
        description: null,
        matchupId: `${left}-vs-${right}`,
        variant,
        deploymentId,
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
