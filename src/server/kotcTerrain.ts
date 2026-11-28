import { KOTC_MATCHUP_ID, type Deployment, type Point, type TerrainLayout } from '../contracts/terrain'
import type { VsDataTerrain } from '../shared/vsData'

/** The current Colosseum first, then the one it replaced. */
const COLOSSEUMS = ['king-of-the-colosseum-2', 'king-of-the-colosseum-1']

type Layout = Extract<VsDataTerrain, { kind: 'terrain-layout' }>
type DeploymentMap = Extract<VsDataTerrain, { kind: 'deployment-map' }>

/** The Colosseums from VS Data's terrain records, each with the deployment map its layout names. */
export function kotcTerrain(records: readonly VsDataTerrain[]): { deployment: Deployment; layout: TerrainLayout }[] {
  return COLOSSEUMS.flatMap((id) => {
    const layout = records.find((record): record is Layout => record.kind === 'terrain-layout' && record.id === id)
    const deploymentId = layout?.deployments?.length === 1 ? layout.deployments[0] : undefined
    const deployment = records.find((record): record is DeploymentMap => record.kind === 'deployment-map' && record.id === deploymentId)
    return layout && deployment ? [{ deployment: deploymentOf(deployment), layout: layoutOf(layout, deployment) }] : []
  })
}

function deploymentOf(record: DeploymentMap): Deployment {
  const attacker = record.zones.find((zone) => zone.role === 'attacker')?.points ?? []
  const depth = Math.min(extent(attacker.map((point) => point.x)), extent(attacker.map((point) => point.y)))
  return {
    id: record.id,
    name: record.name,
    description: `${depth}″ from each board edge on a ${record.board.width}″ square arena.`,
    zones: record.zones.map((zone) => ({
      player: zone.role,
      name: `${zone.role === 'attacker' ? 'Attacker' : 'Defender'} Deployment`,
      colour: zone.role === 'attacker' ? '#ef4444' : '#3b82f6',
      points: zone.points,
    })),
    attackerTerritory: record.territories.find((territory) => territory.role === 'attacker')?.points ?? null,
    objectives: record.objectives.map((objective) => objective.at),
  }
}

function layoutOf(record: Layout, deployment: DeploymentMap): TerrainLayout {
  const { url, pageUrl } = record.provenance.source ?? {}
  const objectiveUrl = deployment.provenance.source?.url
  return {
    id: record.id,
    name: record.name,
    description: null,
    matchupId: KOTC_MATCHUP_ID,
    variant: null,
    deploymentId: deployment.id,
    pieces: [],
    geometry: {
      board: record.board,
      areas: record.areas.map((area) => {
        const board = (point: Point) => round(translate(area.footprint.at, rotate(point, area.footprint.rotation)))
        return {
          id: area.id,
          name: area.name ?? area.id,
          points: area.outline.map(board),
          markers: [],
          objective: area.objective ? { position: board(area.objective.at), group: null } : null,
          group: area.group,
          measurements: (area.measurements ?? []).map(({ from, to, approximate }) => (approximate ? { from, to, approximate } : { from, to })),
          parts: area.parts.map((part) => {
            const placed = (point: Point) =>
              board(translate(part.at, rotate(part.mirror ? { x: -point.x, y: point.y } : point, part.rotation)))
            return {
              id: part.id,
              name: part.name,
              material: part.density,
              roof: part.roof?.map(placed) ?? null,
              walls: part.walls.map((wall) => ({ id: wall.id, points: wall.points.map(placed), thickness: wall.thickness })),
            }
          }),
        }
      }),
    },
    ...(objectiveUrl ? { publisherObjectiveUrl: objectiveUrl } : {}),
    ...(url ? { publisherTerrainUrl: url } : {}),
    ...(pageUrl ? { publisherUrl: pageUrl } : {}),
  }
}

const extent = (values: number[]) => Math.max(...values) - Math.min(...values)
const translate = (by: Point, point: Point): Point => ({ x: by.x + point.x, y: by.y + point.y })
const round = (point: Point): Point => ({ x: Math.round(point.x * 1000) / 1000 + 0, y: Math.round(point.y * 1000) / 1000 + 0 })

/** With y pointing down, a positive angle turns +x towards +y, clockwise as drawn. */
function rotate(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  return { x: point.x * Math.cos(radians) - point.y * Math.sin(radians), y: point.x * Math.sin(radians) + point.y * Math.cos(radians) }
}
