import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useId } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { MissionCardReference } from '../client/components/MissionCardReference'
import { dispositionTone } from '../client/components/rosterSetup'
import { gameReferencesQuery } from '../client/queries'

export const Route = createFileRoute('/mission-matchups/$packId/$you/$opponent')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(gameReferencesQuery())
    const pack = data?.packs.find((entry) => entry.id === params.packId)
    const valid = pack?.missions.some((mission) =>
      mission.matchups.some((pair) => pair[0]?.id === params.you && pair[1]?.id === params.opponent),
    )
    if (!valid) throw notFound()
  },
  component: MissionMatchupPage,
})

function MissionMatchupPage() {
  const { packId, you, opponent } = Route.useParams()
  const { data } = useQuery(gameReferencesQuery())
  const pack = data?.packs.find((entry) => entry.id === packId)
  const yours = pack?.missions.find((mission) => mission.matchups.some((pair) => pair[0]?.id === you && pair[1]?.id === opponent))
  const theirs = pack?.missions.find((mission) => mission.matchups.some((pair) => pair[0]?.id === opponent && pair[1]?.id === you))
  const yourDisposition = data?.dispositions.find((entry) => entry.id === you)
  const opponentDisposition = data?.dispositions.find((entry) => entry.id === opponent)
  const matchupIds = new Set([`${you}-vs-${opponent}`, `${opponent}-vs-${you}`])
  const layouts = data?.terrainLayouts.filter((layout) => matchupIds.has(layout.matchupId)) ?? []
  if (!data || !pack || !yours || !theirs || !yourDisposition || !opponentDisposition) return null

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link to="/mission-packs/$packId" params={{ packId }} className="eyebrow text-azure">
        {pack.name}
      </Link>
      <h1 className="mt-3 text-3xl">
        {yourDisposition.name} vs {opponentDisposition.name}
      </h1>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className={`grid min-h-14 place-items-center border px-3 text-center font-bold uppercase ${dispositionTone(you, true)}`}>
          {yourDisposition.name}
        </div>
        <span className="grid place-items-center text-sm font-bold text-dim">VS</span>
        <div className={`grid min-h-14 place-items-center border px-3 text-center font-bold uppercase ${dispositionTone(opponent, true)}`}>
          {opponentDisposition.name}
        </div>
      </div>

      <section className="mt-7">
        <h2 className="rubric border-b border-edge pb-2">Primary missions</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="border border-edge bg-panel p-4">
            <h3 className="text-xl">{yours.name}</h3>
            {yours.card ? <MissionCardReference card={yours.card} type={yourDisposition.name} /> : null}
          </div>
          <div className="border border-edge bg-panel p-4">
            <h3 className="text-xl">{theirs.name}</h3>
            {theirs.card ? <MissionCardReference card={theirs.card} type={opponentDisposition.name} /> : null}
          </div>
        </div>
      </section>

      <section className="mt-7">
        <h2 className="rubric flex justify-between border-b border-edge pb-2">
          <span>Terrain layouts</span>
          <span className="readout">{layouts.length}</span>
        </h2>
        {layouts.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {layouts.map((layout, index) => (
              <TerrainLayout
                key={layout.id}
                layout={layout}
                deployment={data.deployments.find((entry) => entry.id === layout.deploymentId)}
                templates={data.terrainTemplates ?? []}
                label={String.fromCharCode(65 + index)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-dim">No terrain layouts are associated with this matchup in the synced source.</p>
        )}
      </section>
      <p className="mt-6 border-t border-edge pt-3 text-xs text-dim">{data.attribution}</p>
    </main>
  )
}

function TerrainLayout({
  layout,
  deployment,
  templates,
  label,
}: {
  layout: {
    name: string
    description: string | null
    pieces: TerrainPiece[]
    geometry: TerrainGeometry | null
  }
  templates: TerrainTemplate[]
  deployment?: {
    name: string
    zones: { player: string; name: string; colour: string; points: { x: number; y: number }[] }[]
    objectives: { x: number; y: number }[]
  }
  label: string
}) {
  const description = deployment?.name ?? layout.description ?? layout.name

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group border border-edge bg-panel p-3 text-left transition-colors hover:border-azure focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
            aria-label={`Enlarge terrain layout ${label}: ${description}`}
          />
        }
      >
        <span className="block text-center text-lg font-bold">{label}</span>
        <TerrainBoard layout={layout} deployment={deployment} templates={templates} className="mt-2 w-full" />
        <span className="mt-2 block text-xs text-dim group-hover:text-bone">{description}</span>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-none border border-edge bg-panel p-4 text-bone ring-0 sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            Layout {label} · {layout.name}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-edge py-2 text-xs text-dim">
          <span className="flex items-center gap-2">
            <span className="size-3 border border-azure bg-raised" /> Terrain area footprint
          </span>
          <span className="flex items-center gap-2">
            <span className="flex size-3 overflow-hidden border border-edge">
              <span className="w-1/2 bg-side-a/60" />
              <span className="w-1/2 bg-side-b/60" />
            </span>
            Deployment zones
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-4 bg-discarded" /> Physical terrain
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-full border border-bone bg-void" /> Objective
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px w-4 bg-side-a" /> Setup distance
          </span>
          <span>Grid: 1″ · heavier line every 5″</span>
        </div>
        <TerrainBoard layout={layout} deployment={deployment} templates={templates} className="mx-auto w-full max-w-5xl" detailed />
      </DialogContent>
    </Dialog>
  )
}

function TerrainBoard({
  layout,
  deployment,
  templates,
  className,
  detailed = false,
}: {
  layout: { name: string; pieces: TerrainPiece[]; geometry: TerrainGeometry | null }
  templates: TerrainTemplate[]
  deployment?: {
    zones: { player: string; name: string; colour: string; points: { x: number; y: number }[] }[]
    objectives: { x: number; y: number }[]
  }
  className?: string
  detailed?: boolean
}) {
  const patternId = useId().replaceAll(':', '')
  const flipped = deploymentNeedsFlip(deployment?.zones ?? [])
  const hasObjectiveTerrain = layout.geometry?.areas.some((area) => area.markers?.length) ?? false

  return (
    <svg viewBox="0 0 44 60" className={`border border-edge bg-sunken ${className ?? ''}`} aria-label={layout.name}>
      <title>{layout.name}</title>
      <defs>
        <pattern id={`${patternId}-minor`} width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" className="stroke-bone/10" strokeWidth=".08" />
        </pattern>
        <pattern id={`${patternId}-major`} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill={`url(#${patternId}-minor)`} />
          <path d="M 5 0 L 0 0 0 5" fill="none" className="stroke-bone/25" strokeWidth=".12" />
        </pattern>
        <pattern id={`${patternId}-terrain`} width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1" height="1" className="fill-bone/15" />
          <line x1="0" y1="0" x2="0" y2="1" className="stroke-bone/35" strokeWidth=".15" />
        </pattern>
        <marker
          id={`${patternId}-arrow`}
          viewBox="0 0 1.2 1.2"
          refX="1.2"
          refY=".6"
          markerWidth=".65"
          markerHeight=".65"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 1.2 .6 L 0 1.2 Z" className="fill-side-a" />
        </marker>
      </defs>
      <rect width="44" height="60" fill={`url(#${patternId}-major)`} />
      <g transform={flipped ? 'translate(44 0) rotate(90)' : 'translate(0 60) rotate(-90)'}>
        <rect width="60" height="44" fill="none" stroke="currentColor" strokeWidth=".25" />
        {deployment?.zones.map((zone) => (
          <polygon
            key={zone.name}
            points={zone.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill={zone.colour}
            fillOpacity=".22"
            stroke={zone.colour}
            strokeWidth=".25"
          />
        ))}
        {layout.geometry ? (
          <ExactTerrainGeometry geometry={layout.geometry} detailed={detailed} flipped={flipped} zones={deployment?.zones ?? []} />
        ) : (
          layout.pieces
            .filter((piece) => !piece.parentAreaId)
            .map((piece) => (
              <TerrainPieceShape
                key={piece.id}
                piece={piece}
                pieces={layout.pieces}
                templates={templates}
                terrainPatternId={`${patternId}-terrain`}
                detailed={detailed}
              />
            ))
        )}
        {deployment?.objectives.map((objective) => {
          if (hasObjectiveTerrain) return null
          const homeZone = deployment.zones.find((zone) => pointInPolygon(objective, zone.points))
          return (
            <g key={`${objective.x}-${objective.y}`} transform={`translate(${objective.x} ${objective.y})`}>
              <circle
                r={homeZone ? '1.18' : '1'}
                className={homeZone ? 'fill-void' : 'fill-void stroke-bone'}
                stroke={homeZone?.colour}
                strokeWidth=".3"
              />
              {homeZone ? <circle r=".62" fill="none" className="stroke-bone" strokeWidth=".22" /> : null}
            </g>
          )
        })}
      </g>
      {detailed && layout.geometry ? (
        <TerrainMeasurements geometry={layout.geometry} flipped={flipped} arrowId={`${patternId}-arrow`} />
      ) : null}
    </svg>
  )
}

type TerrainPiece = {
  id: string
  name: string
  type: string
  templateId: string
  position: { x: number; y: number }
  rotation: number
  mirror: string | null
  parentAreaId: string | null
}

type TerrainGeometry = {
  areas: {
    id: string
    name: string
    points: { x: number; y: number }[]
    markers: { label: string; position: { x: number; y: number } }[]
    parts: {
      id: string
      name: string
      material: string
      roof: { x: number; y: number }[] | null
      walls: { id: string; points: { x: number; y: number }[]; thickness: number }[]
    }[]
  }[]
}

function ExactTerrainGeometry({
  geometry,
  detailed,
  flipped,
  zones,
}: {
  geometry: TerrainGeometry
  detailed: boolean
  flipped: boolean
  zones: { colour: string; points: { x: number; y: number }[] }[]
}) {
  return geometry.areas.map((area) => (
    <g key={area.id}>
      <polygon points={svgPoints(area.points)} className="fill-raised/90 stroke-azure" strokeWidth={detailed ? '.18' : '.25'}>
        <title>{area.name}</title>
      </polygon>
      {area.parts.map((part, partIndex) => {
        const stroke = partIndex % 2 === 0 ? 'stroke-discarded' : 'stroke-achieved'
        return (
          <g key={part.id}>
            {part.roof?.length ? (
              <polygon points={svgPoints(part.roof)} className="fill-bone/10 stroke-bone/55" strokeWidth=".12" strokeDasharray=".3 .2" />
            ) : null}
            {part.walls.map((wall) => (
              <polyline
                key={wall.id}
                points={svgPoints(wall.points)}
                fill="none"
                className={stroke}
                strokeWidth={wall.thickness}
                strokeLinejoin="miter"
                strokeLinecap="square"
              >
                <title>{part.name}</title>
              </polyline>
            ))}
          </g>
        )
      })}
      {detailed
        ? (area.markers ?? []).map((marker) => (
            <g
              key={marker.label}
              transform={`translate(${terrainMarkerPosition(area, marker).x} ${terrainMarkerPosition(area, marker).y}) rotate(${flipped ? -90 : 90})`}
            >
              <circle r="1" className="fill-raised stroke-bone" strokeWidth=".18" />
              <text textAnchor="middle" dominantBaseline="middle" className="fill-bone" fontSize=".62" fontWeight="700">
                {marker.label}
              </text>
              <title>{marker.label} terrain</title>
            </g>
          ))
        : null}
      {detailed && area.markers?.length ? (
        <ObjectiveTerrainMarker
          position={objectiveTerrainMarkerPosition(area)}
          counterRotation={flipped ? -90 : 90}
          homeColour={zones.find((zone) => pointInPolygon(objectiveTerrainMarkerPosition(area), zone.points))?.colour}
        />
      ) : null}
    </g>
  ))
}

function objectiveTerrainMarkerPosition(area: TerrainGeometry['areas'][number]) {
  const centre = polygonCentroid(area.points)
  const terrainMarkers = area.markers.map((marker) => terrainMarkerPosition(area, marker))
  const offsets = [
    { x: 0, y: 0 },
    { x: 0, y: -3 },
    { x: 3, y: 0 },
    { x: 0, y: 3 },
    { x: -3, y: 0 },
    { x: 2.2, y: -2.2 },
    { x: 2.2, y: 2.2 },
    { x: -2.2, y: 2.2 },
    { x: -2.2, y: -2.2 },
  ]
  return (
    offsets
      .map((offset) => ({ x: centre.x + offset.x, y: centre.y + offset.y }))
      .find(
        (candidate) =>
          markerPositionIsOpen(area, candidate, 1.15) &&
          terrainMarkers.every((marker) => Math.hypot(candidate.x - marker.x, candidate.y - marker.y) >= 2.5),
      ) ?? centre
  )
}

function terrainMarkerPosition(area: TerrainGeometry['areas'][number], marker: TerrainGeometry['areas'][number]['markers'][number]) {
  const centre = polygonCentroid(area.points)
  const offsets = [
    { x: 0, y: 0 },
    { x: 1.4, y: 0 },
    { x: -1.4, y: 0 },
    { x: 0, y: 1.4 },
    { x: 0, y: -1.4 },
    { x: 2.4, y: 0 },
    { x: -2.4, y: 0 },
    { x: 0, y: 2.4 },
    { x: 0, y: -2.4 },
  ]
  return (
    offsets
      .map((offset) => ({ x: marker.position.x + offset.x, y: marker.position.y + offset.y }))
      .find((candidate) => markerPositionIsOpen(area, candidate, 1.05)) ??
    (markerPositionIsOpen(area, centre, 1.05) ? centre : marker.position)
  )
}

function markerPositionIsOpen(area: TerrainGeometry['areas'][number], candidate: { x: number; y: number }, clearance: number) {
  if (!pointInPolygon(candidate, area.points)) return false
  if (area.parts.some((part) => part.roof?.length && pointInPolygon(candidate, part.roof))) return false
  return area.parts.every((part) =>
    part.walls.every((wall) =>
      wall.points.every((point, index) => {
        const next = wall.points[index + 1]
        return !next || pointToSegmentDistance(candidate, point, next) >= clearance + wall.thickness / 2
      }),
    ),
  )
}

function pointToSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y)
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy))
}

function ObjectiveTerrainMarker({
  position,
  counterRotation,
  homeColour,
}: {
  position: { x: number; y: number }
  counterRotation: number
  homeColour?: string
}) {
  return (
    <g transform={`translate(${position.x} ${position.y}) rotate(${counterRotation})`}>
      <circle
        r="1.08"
        className={homeColour ? 'fill-raised' : 'fill-raised stroke-bone'}
        stroke={homeColour}
        strokeWidth={homeColour ? '.28' : '.18'}
      />
      <circle r=".54" fill="none" className="stroke-bone" strokeWidth=".14" />
      <circle r=".16" className="fill-bone" />
      <rect x="-1.08" y=".78" width="2.16" height=".5" rx=".1" className="fill-bone" />
      <text x="0" y="1.04" textAnchor="middle" dominantBaseline="middle" className="fill-void" fontSize=".28" fontWeight="800">
        OBJECTIVE
      </text>
      <title>Objective terrain</title>
    </g>
  )
}

function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

function svgPoints(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function TerrainMeasurements({ geometry, flipped, arrowId }: { geometry: TerrainGeometry; flipped: boolean; arrowId: string }) {
  const measurements = geometry.areas
    .flatMap((area) => {
      const centre = polygonCentroid(area.points)
      const verticalEdge = centre.x < 30 ? 0 : 60
      const horizontalEdge = centre.y < 22 ? 0 : 44
      const verticalPivot = measurementAnchor(area.points, 'x', verticalEdge, horizontalEdge)
      const horizontalPivot = measurementAnchor(area.points, 'y', horizontalEdge, verticalEdge)
      if (!verticalPivot || !horizontalPivot) return []
      return [
        {
          areaId: area.id,
          from: { x: verticalEdge, y: verticalPivot.y },
          to: verticalPivot,
          value: Math.abs(verticalPivot.x - verticalEdge),
        },
        {
          areaId: area.id,
          from: { x: horizontalPivot.x, y: horizontalEdge },
          to: horizontalPivot,
          value: Math.abs(horizontalPivot.y - horizontalEdge),
        },
      ]
    })
    .filter((measurement) => measurement.value >= 0.5)
    .filter((measurement, index, all) => {
      const sameRuler = (other: typeof measurement) =>
        Math.abs(other.from.x - measurement.from.x) < 0.05 &&
        Math.abs(other.from.y - measurement.from.y) < 0.05 &&
        Math.abs(other.to.x - measurement.to.x) < 0.05 &&
        Math.abs(other.to.y - measurement.to.y) < 0.05
      return all.findIndex(sameRuler) === index
    })

  const occupied: LabelBox[] = []
  const annotations = measurements.map((measurement, index) => {
    const from = portraitPoint(measurement.from, flipped)
    const to = portraitPoint(measurement.to, flipped)
    const vertical = Math.abs(from.x - to.x) < Math.abs(from.y - to.y)
    const text = formatInches(measurement.value)
    const label = placeMeasurementLabel(to, from, vertical, text, occupied)
    const { width: labelWidth, height: labelHeight } = measurementLabelSize(text)
    return {
      key: `${measurement.from.x}-${measurement.from.y}-${measurement.to.x}-${measurement.to.y}-${index}`,
      from,
      to,
      text,
      label,
      labelWidth,
      labelHeight,
    }
  })

  return (
    <g>
      {annotations.map(({ key, from, to }) => (
        <line
          key={key}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          className="stroke-side-a"
          strokeWidth=".12"
          markerEnd={`url(#${arrowId})`}
        />
      ))}
      {annotations.map(({ key, text, label, labelWidth, labelHeight }) => (
        <g key={key}>
          <rect
            x={label.x - labelWidth / 2}
            y={label.y - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            rx=".14"
            className="fill-side-a"
          />
          <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="fill-bone" fontSize=".9" fontWeight="700">
            {text}
          </text>
        </g>
      ))}
    </g>
  )
}

function measurementAnchor(points: { x: number; y: number }[], axis: 'x' | 'y', edge: number, otherEdge: number) {
  const perpendicular = axis === 'x' ? 'y' : 'x'
  const segments = points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]
    if (!next) return []
    const acrossEdge = Math.abs(next[axis] - point[axis])
    const alongEdge = Math.abs(next[perpendicular] - point[perpendicular])
    if (alongEdge < 0.5 || acrossEdge > Math.max(0.03, alongEdge * 0.03)) return []
    const anchor = Math.abs(point[perpendicular] - otherEdge) <= Math.abs(next[perpendicular] - otherEdge) ? point : next
    return [{ point: anchor }]
  })
  if (!segments.length) {
    const corners = points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length]
      const next = points[(index + 1) % points.length]
      if (!previous || !next) return false
      return Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5 || Math.hypot(next.x - point.x, next.y - point.y) >= 0.5
    })
    const candidates = corners.length ? corners : points
    return candidates.toSorted((left, right) => measurementAnchorScore(left, axis, edge) - measurementAnchorScore(right, axis, edge))[0]
  }
  return segments.toSorted((left, right) => {
    const leftScore = measurementAnchorScore(left.point, axis, edge) + Math.abs(left.point[perpendicular] - otherEdge) * 0.02
    const rightScore = measurementAnchorScore(right.point, axis, edge) + Math.abs(right.point[perpendicular] - otherEdge) * 0.02
    return leftScore - rightScore
  })[0]?.point
}

function measurementAnchorScore(point: { x: number; y: number }, axis: 'x' | 'y', edge: number) {
  const value = Math.abs(point[axis] - edge)
  const wholeInchError = Math.abs(value - Math.round(value))
  return wholeInchError * 20 + value * 0.01
}

type LabelBox = { left: number; right: number; top: number; bottom: number }

function placeMeasurementLabel(
  arrow: { x: number; y: number },
  boardEdge: { x: number; y: number },
  vertical: boolean,
  text: string,
  occupied: LabelBox[],
) {
  const { width, height } = measurementLabelSize(text)
  const length = Math.hypot(boardEdge.x - arrow.x, boardEdge.y - arrow.y)
  const direction = length ? { x: (boardEdge.x - arrow.x) / length, y: (boardEdge.y - arrow.y) / length } : { x: 0, y: 0 }
  const perpendicular = { x: -direction.y, y: direction.x }
  const inlineDistance = (vertical ? height : width) / 2 + 1.05
  const offsets = [0, 0.9, -0.9, 1.8, -1.8].flatMap((sideways) =>
    [0, 1.5, 3].map((back) => ({
      x: direction.x * (inlineDistance + back) + perpendicular.x * sideways,
      y: direction.y * (inlineDistance + back) + perpendicular.y * sideways,
    })),
  )

  for (const offset of offsets) {
    const x = Math.min(44 - width / 2 - 0.25, Math.max(width / 2 + 0.25, arrow.x + offset.x))
    const y = Math.min(60 - height / 2 - 0.25, Math.max(height / 2 + 0.25, arrow.y + offset.y))
    const box = { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 }
    if (occupied.every((other) => !boxesOverlap(box, other))) {
      occupied.push(box)
      return { x, y }
    }
  }

  return {
    x: Math.min(44 - width / 2 - 0.25, Math.max(width / 2 + 0.25, arrow.x + direction.x * inlineDistance)),
    y: Math.min(60 - height / 2 - 0.25, Math.max(height / 2 + 0.25, arrow.y + direction.y * inlineDistance)),
  }
}

function measurementLabelSize(text: string) {
  return { width: Math.max(2, text.length * 0.58), height: 1.25 }
}

function boxesOverlap(one: LabelBox, two: LabelBox) {
  const gap = 0.3
  return one.left < two.right + gap && one.right + gap > two.left && one.top < two.bottom + gap && one.bottom + gap > two.top
}

function deploymentNeedsFlip(zones: { player: string; name: string; points: { x: number; y: number }[] }[]) {
  const attacker = zones.find((zone) => zone.player === 'attacker' || zone.name.toLowerCase().includes('attacker'))
  const defender = zones.find((zone) => zone.player === 'defender' || zone.name.toLowerCase().includes('defender'))
  if (!attacker || !defender) return false
  const red = portraitPoint(polygonCentroid(attacker.points), false)
  const blue = portraitPoint(polygonCentroid(defender.points), false)
  const horizontalSeparation = Math.abs(red.x - blue.x) > Math.abs(red.y - blue.y)
  return horizontalSeparation ? red.x > blue.x : red.y > blue.y
}

function portraitPoint(point: { x: number; y: number }, flipped: boolean) {
  return flipped ? { x: 44 - point.y, y: point.x } : { x: point.y, y: 60 - point.x }
}

function formatInches(value: number) {
  const rounded = Math.round(value * 4) / 4
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, '')}″`
}

type TerrainTemplate = {
  id: string
  name: string
  kind: string
  points: { x: number; y: number }[]
  features?: {
    id: string
    templateId: string
    position: { x: number; y: number }
    rotation: number
    mirror: string | null
  }[]
}

function TerrainPieceShape({
  piece,
  pieces,
  templates,
  terrainPatternId,
  detailed,
}: {
  piece: TerrainPiece
  pieces: TerrainPiece[]
  templates: TerrainTemplate[]
  terrainPatternId: string
  detailed: boolean
}) {
  const template = templates.find((entry) => entry.id === piece.templateId)
  if (!template?.points.length) return null
  const centre = polygonCentroid(template.points)
  const points = template.points.map((point) => `${point.x - centre.x},${point.y - centre.y}`).join(' ')
  const scale = piece.mirror === 'horizontal' ? '-1 1' : piece.mirror === 'vertical' ? '1 -1' : '1 1'
  const children = pieces.filter((candidate) => candidate.parentAreaId === piece.id)
  return (
    <g transform={`translate(${piece.position.x} ${piece.position.y}) rotate(${piece.rotation}) scale(${scale})`}>
      <polygon
        points={points}
        fill={piece.type === 'area' ? undefined : `url(#${terrainPatternId})`}
        className={piece.type === 'area' ? 'fill-raised/90 stroke-azure' : 'stroke-bone'}
        strokeWidth={piece.type === 'area' ? (detailed ? '.18' : '.25') : '.28'}
      />
      {(template.features ?? []).map((feature) => (
        <TerrainTemplateFeature key={feature.id} feature={feature} templates={templates} />
      ))}
      {children.map((child) => (
        <TerrainPieceShape
          key={child.id}
          piece={child}
          pieces={pieces}
          templates={templates}
          terrainPatternId={terrainPatternId}
          detailed={detailed}
        />
      ))}
    </g>
  )
}

function TerrainTemplateFeature({
  feature,
  templates,
}: {
  feature: NonNullable<TerrainTemplate['features']>[number]
  templates: TerrainTemplate[]
}) {
  const template = templates.find((entry) => entry.id === feature.templateId)
  if (!template?.points.length) return null
  const centre = polygonCentroid(template.points)
  const points = template.points.map((point) => `${point.x - centre.x},${point.y - centre.y}`).join(' ')
  const scale = feature.mirror === 'horizontal' ? '-1 1' : feature.mirror === 'vertical' ? '1 -1' : '1 1'

  return (
    <polygon
      points={points}
      transform={`translate(${feature.position.x} ${feature.position.y}) rotate(${feature.rotation}) scale(${scale})`}
      className="fill-bone/20 stroke-bone"
      strokeWidth=".2"
    />
  )
}

function polygonCentroid(points: { x: number; y: number }[]) {
  let signedArea = 0
  let x = 0
  let y = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross = current.x * next.y - next.x * current.y
    signedArea += cross
    x += (current.x + next.x) * cross
    y += (current.y + next.y) * cross
  }

  if (Math.abs(signedArea) < Number.EPSILON) {
    return { x: 0, y: 0 }
  }

  return { x: x / (3 * signedArea), y: y / (3 * signedArea) }
}
