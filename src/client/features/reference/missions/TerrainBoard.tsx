import { useId } from 'react'
import { cn } from '@/lib/utils'
import { groupBy } from '../../../../core/collections'

import {
  deploymentLines,
  deploymentObjectiveMarkers,
  deploymentNeedsFlip,
  formatInches,
  type Measurement,
  measurementLabelSize,
  placementMeasurements,
  objectiveTerrainMarkers,
  placeMeasurementLabel,
  pointInPolygon,
  polygonCentroid,
  portraitPoint,
  type LabelBox,
  svgPoints,
  terrainAreaJoins,
  type TerrainGeometry,
  type TerrainPiece,
  type TerrainTemplate,
  terrainMarkerPosition,
  territoryBoundary,
} from './terrainGeometry'

/** What a detailed board measures terrain to; `published` is the layout diagram's own distances, often to objective centres. */
export type MeasurementSource = 'terrain' | 'lines' | 'edges' | 'published' | 'mat'

const publishedOnly: MeasurementSource[] = ['published']

export function TerrainBoard({
  layout,
  deployment,
  templates,
  className,
  detailed = false,
  show = publishedOnly,
  ariaLabel,
}: {
  layout: { name: string; pieces: TerrainPiece[]; geometry: TerrainGeometry | null; publisherUrl?: string }
  templates: TerrainTemplate[]
  deployment?: {
    zones: { player: string; name: string; points: { x: number; y: number }[] }[]
    attackerTerritory?: { x: number; y: number }[] | null
    objectives: { x: number; y: number }[]
  }
  className?: string
  detailed?: boolean
  show?: MeasurementSource[]
  ariaLabel?: string
}) {
  const patternId = useId().replaceAll(':', '')
  const board = layout.geometry?.board ?? { width: 60, height: 44 }
  const flipped = deploymentNeedsFlip(deployment?.zones ?? [], board)
  const upright = flipped ? `translate(${board.height} 0) rotate(90)` : `translate(0 ${board.width}) rotate(-90)`
  const objectives = deploymentObjectiveMarkers(layout.geometry, deployment?.objectives ?? [])
  const objectivePositions = [
    ...objectives.map((objective) => objective.position),
    ...(layout.geometry ? objectiveTerrainMarkers(layout.geometry).map((objective) => objective.position) : []),
  ]

  const showMat = detailed && show.includes('mat') && layout.geometry !== null
  const margin = showMat ? rulerMargin : 0

  const svg = (
    <svg
      viewBox={`${-margin} ${-margin / 2} ${board.height + margin * 1.5} ${board.width + margin * 1.5}`}
      className={cn('border border-edge bg-sunken', className)}
      aria-label={ariaLabel ?? layout.name}
    >
      <title>{ariaLabel ?? layout.name}</title>
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
      <rect width={board.height} height={board.width} fill={`url(#${patternId}-major)`} />
      <g transform={upright}>
        <rect width={board.width} height={board.height} fill="none" stroke="currentColor" strokeWidth=".25" />
        {deployment?.attackerTerritory ? (
          <>
            <path
              d={`M 0 0 H ${board.width} V ${board.height} H 0 Z M ${svgPoints(deployment.attackerTerritory)} Z`}
              fillRule="evenodd"
              className="fill-side-b/10"
            >
              <title>Defender's territory</title>
            </path>
            <polygon points={svgPoints(deployment.attackerTerritory)} className="fill-side-a/10">
              <title>Attacker's territory</title>
            </polygon>
          </>
        ) : null}
        {deployment?.zones.map((zone) => (
          <polygon
            key={zone.name}
            points={zone.points.map((point) => `${point.x},${point.y}`).join(' ')}
            className={deploymentZoneClass(zone.player)}
            strokeWidth=".25"
          />
        ))}
        {deployment?.attackerTerritory ? (
          <path
            d={territoryBoundary(deployment.attackerTerritory, board)
              .map(([start, end]) => `M ${start.x} ${start.y} L ${end.x} ${end.y}`)
              .join(' ')}
            fill="none"
            className="stroke-bone/60"
            strokeWidth=".25"
            strokeDasharray="0 .6"
            strokeLinecap="round"
          >
            <title>Territory boundary</title>
          </path>
        ) : null}
        {layout.geometry ? (
          <ExactTerrainGeometry geometry={layout.geometry} detailed={detailed} />
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
      </g>
      {detailed && layout.geometry ? (
        <TerrainMeasurements
          geometry={layout.geometry}
          measurements={[
            ...(show.includes('terrain') || show.includes('lines') || show.includes('edges')
              ? placementMeasurements(
                  layout.geometry,
                  objectivePositions,
                  show.includes('lines') && deployment ? deploymentLines(deployment, layout.geometry.board) : [],
                  { terrain: show.includes('terrain'), edges: show.includes('edges') },
                )
              : []),
            ...(show.includes('published') ? layout.geometry.areas.flatMap((area) => area.measurements) : []),
          ]}
          flipped={flipped}
          arrowId={`${patternId}-arrow`}
          objectives={objectivePositions}
        />
      ) : null}
      {showMat && layout.geometry ? <MatCoordinates geometry={layout.geometry} flipped={flipped} objectives={objectivePositions} /> : null}
      <g transform={upright}>
        {layout.geometry ? (
          <TerrainAnnotations
            geometry={layout.geometry}
            detailed={detailed}
            flipped={flipped}
            zones={deployment?.zones ?? []}
            objectives={objectivePositions}
          />
        ) : null}
        {objectives.map(({ position, kind }) => {
          const homeZone = deployment?.zones.find((zone) => pointInPolygon(position, zone.points))
          return kind === 'terrain' ? (
            <ObjectiveTerrainMarker
              key={`${position.x}-${position.y}`}
              position={position}
              counterRotation={flipped ? -90 : 90}
              homePlayer={homeZone?.player}
              detailed={detailed}
            />
          ) : (
            <g key={`${position.x}-${position.y}`} transform={`translate(${position.x} ${position.y}) rotate(${flipped ? -90 : 90})`}>
              <title>{kind === 'marker' ? 'Objective marker outside terrain (40 mm)' : 'Objective marker (40 mm)'}</title>
              <circle
                r="0.787"
                className={homeZone ? `fill-void ${deploymentZoneStroke(homeZone.player)}` : 'fill-void stroke-bone'}
                strokeWidth=".15"
              />
              {homeZone ? <circle r=".48" fill="none" className="stroke-bone" strokeWidth=".12" /> : null}
              {detailed ? <ObjectiveBadge /> : null}
            </g>
          )
        })}
      </g>
    </svg>
  )
  if (!detailed || !layout.publisherUrl) return svg
  return (
    <figure className="contents">
      {svg}
      <figcaption className="mt-2 text-sm text-dim">
        The walls, ruins, and objectives are traced from published diagrams that print no placement distances, so those positions are
        approximate.
      </figcaption>
    </figure>
  )
}

function ExactTerrainGeometry({ geometry, detailed }: { geometry: TerrainGeometry; detailed: boolean }) {
  const terrainAreas = groupBy(geometry.areas, (area) => area.group ?? area.id)
  return (
    <>
      {/* Each footprint's fill covers the inner half of its doubled outline, so footprints of one area show only their shared perimeter. */}
      {[...terrainAreas].map(([key, footprints]) => (
        <g key={key} className="stroke-azure" opacity=".9">
          {footprints.map((area) => (
            <polygon key={area.id} points={svgPoints(area.points)} fill="none" strokeWidth={detailed ? '.36' : '.5'} />
          ))}
          {footprints.map((area) => (
            <polygon key={area.id} points={svgPoints(area.points)} className="fill-raised" stroke="none">
              <title>{area.name}</title>
            </polygon>
          ))}
        </g>
      ))}
      {geometry.areas.map((area) => (
        <g key={area.id}>
          {area.parts.map((part) => {
            const colour =
              part.material === 'dense'
                ? 'fill-achieved/20 stroke-achieved'
                : part.material === 'light'
                  ? 'fill-discarded/20 stroke-discarded'
                  : 'fill-bone/10 stroke-bone'
            return (
              <g key={part.id} className={colour}>
                {part.roof?.length ? (
                  <polygon points={svgPoints(part.roof)} strokeOpacity=".55" strokeWidth=".12" strokeDasharray=".3 .2" />
                ) : null}
                {part.walls.map((wall) => (
                  <polyline
                    key={wall.id}
                    points={svgPoints(wall.points)}
                    fill="none"
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
        </g>
      ))}
    </>
  )
}

function TerrainAnnotations({
  geometry,
  detailed,
  flipped,
  zones,
  objectives,
}: {
  geometry: TerrainGeometry
  detailed: boolean
  flipped: boolean
  zones: { player: string; points: { x: number; y: number }[] }[]
  objectives: { x: number; y: number }[]
}) {
  return (
    <>
      {detailed
        ? geometry.areas.flatMap((area) =>
            area.markers.map((marker) => {
              const position = terrainMarkerPosition(area, marker, objectives)
              return (
                <g key={`${area.id}-${marker.label}`} transform={`translate(${position.x} ${position.y}) rotate(${flipped ? -90 : 90})`}>
                  <circle r="1" className="fill-raised stroke-bone" strokeWidth=".18" />
                  <text textAnchor="middle" dominantBaseline="middle" className="fill-bone" fontSize=".62" fontWeight="700">
                    {marker.label}
                  </text>
                  <title>{`${marker.label} terrain`}</title>
                </g>
              )
            }),
          )
        : null}
      {detailed
        ? terrainAreaJoins(geometry).map((join) => (
            <g key={`${join.x}-${join.y}`} transform={`translate(${join.x} ${join.y}) rotate(${flipped ? -90 : 90})`}>
              <circle r=".8" className="fill-raised stroke-azure" strokeWidth=".14" />
              <g transform="scale(.05) translate(-12 -12)" fill="none" className="stroke-bone" strokeWidth="2.4" strokeLinecap="round">
                <path d={eyePath} />
                <circle cx="12" cy="12" r="3" />
              </g>
              <title>Footprints of one terrain area</title>
            </g>
          ))
        : null}
      {objectiveTerrainMarkers(geometry).map((objective) => (
        <ObjectiveTerrainMarker
          key={objective.key}
          position={objective.position}
          counterRotation={flipped ? -90 : 90}
          homePlayer={zones.find((zone) => pointInPolygon(objective.position, zone.points))?.player}
          detailed={detailed}
        />
      ))}
    </>
  )
}

/** Lucide's eye, matching the mark the publisher's layouts print across joined footprints. */
const eyePath = 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'

function ObjectiveTerrainMarker({
  position,
  counterRotation,
  homePlayer,
  detailed,
}: {
  position: { x: number; y: number }
  counterRotation: number
  homePlayer?: string
  detailed: boolean
}) {
  return (
    <g transform={`translate(${position.x} ${position.y}) rotate(${counterRotation})`}>
      <circle
        r="1.08"
        className={homePlayer ? `fill-raised ${deploymentZoneStroke(homePlayer)}` : 'fill-raised stroke-bone'}
        strokeWidth={homePlayer ? '.28' : '.18'}
      />
      {detailed ? (
        <>
          <circle r=".54" fill="none" className="stroke-bone" strokeWidth=".14" />
          <circle r=".16" className="fill-bone" />
          <ObjectiveBadge />
        </>
      ) : null}
      <title>Objective terrain</title>
    </g>
  )
}

function ObjectiveBadge() {
  return (
    <>
      <rect x="-1.08" y=".78" width="2.16" height=".5" rx=".1" className="fill-bone" />
      <text x="0" y="1.04" textAnchor="middle" dominantBaseline="middle" className="fill-void" fontSize=".28" fontWeight="800">
        OBJECTIVE
      </text>
    </>
  )
}

export function deploymentZoneClass(player: string) {
  if (player === 'attacker') return 'fill-side-a/20 stroke-side-a'
  if (player === 'defender') return 'fill-side-b/20 stroke-side-b'
  return 'fill-parchment/20 stroke-parchment'
}

function deploymentZoneStroke(player: string) {
  if (player === 'attacker') return 'stroke-side-a'
  if (player === 'defender') return 'stroke-side-b'
  return 'stroke-parchment'
}

const rulerMargin = 2.2

function MatCoordinates({
  geometry,
  flipped,
  objectives,
}: {
  geometry: TerrainGeometry
  flipped: boolean
  objectives: { x: number; y: number }[]
}) {
  const { board } = geometry
  const across = Array.from({ length: board.height + 1 }, (_, inch) => inch)
  const up = Array.from({ length: board.width + 1 }, (_, inch) => inch)
  const numbered = (inch: number, length: number) => (inch % 6 === 0 && length - inch >= 3) || inch === length
  const placed = placementMeasurements(geometry, objectives, [], { terrain: false, edges: true })
  const points = [...new Map(placed.map(({ to, approximate }) => [`${to.x}-${to.y}`, { point: to, approximate }])).values()].map(
    ({ point, approximate }) => {
      const portrait = portraitPoint(point, flipped, board)
      return { portrait, text: `${approximate ? '≈' : ''}${matInches(portrait.x)} · ${matInches(board.width - portrait.y)}` }
    },
  )
  const occupied: LabelBox[] = [
    ...points.map(({ portrait }) => ({ left: portrait.x - 0.3, right: portrait.x + 0.3, top: portrait.y - 0.3, bottom: portrait.y + 0.3 })),
    ...objectives.map((position) => {
      const centre = portraitPoint(position, flipped, board)
      return { left: centre.x - 1.3, right: centre.x + 1.3, top: centre.y - 1.3, bottom: centre.y + 1.4 }
    }),
    ...geometry.areas.flatMap((area) => area.markers.map((marker) => terrainMarkerPosition(area, marker, objectives))),
    ...terrainAreaJoins(geometry),
  ].map((box) => {
    if ('left' in box) return box
    const centre = portraitPoint(box, flipped, board)
    return { left: centre.x - 1.1, right: centre.x + 1.1, top: centre.y - 1.1, bottom: centre.y + 1.1 }
  })
  const labels = points.map(({ portrait, text }) => {
    const towardCentre = { x: portrait.x + (portrait.x < board.height / 2 ? 1 : -1), y: portrait.y }
    return {
      portrait,
      text,
      label: placeMeasurementLabel(portrait, towardCentre, false, text, occupied, board),
      size: measurementLabelSize(text),
    }
  })

  return (
    <g>
      <g className="stroke-bone/70" strokeWidth=".08">
        {across.map((inch) => (
          <line key={inch} x1={inch} y1={board.width} x2={inch} y2={board.width + (numbered(inch, board.height) ? 0.8 : 0.4)} />
        ))}
        {up.map((inch) => (
          <line key={inch} x1={0} y1={board.width - inch} x2={numbered(inch, board.width) ? -0.8 : -0.4} y2={board.width - inch} />
        ))}
      </g>
      <g className="fill-dim" fontSize=".85">
        {across
          .filter((inch) => numbered(inch, board.height) && inch)
          .map((inch) => (
            <text key={inch} x={inch} y={board.width + 1.6} textAnchor="middle">
              {inch}
            </text>
          ))}
        {up
          .filter((inch) => numbered(inch, board.width) && inch)
          .map((inch) => (
            <text key={inch} x={-1} y={board.width - inch} textAnchor="end" dominantBaseline="middle">
              {inch}
            </text>
          ))}
        <text x={-1} y={board.width + 1.6} textAnchor="end">
          0
        </text>
      </g>
      {labels.map(({ portrait, label }) => (
        <line
          key={`${portrait.x}-${portrait.y}`}
          x1={portrait.x}
          y1={portrait.y}
          x2={label.x}
          y2={label.y}
          className="stroke-parchment"
          strokeWidth=".1"
        />
      ))}
      {labels.map(({ portrait, text, label, size }) => (
        <g key={`${portrait.x}-${portrait.y}`}>
          <circle cx={portrait.x} cy={portrait.y} r=".22" className="fill-parchment" />
          <rect
            x={label.x - size.width / 2}
            y={label.y - size.height / 2}
            width={size.width}
            height={size.height}
            rx=".14"
            className="fill-parchment"
          />
          <text
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-parchment-ink"
            fontSize=".9"
            fontWeight="700"
          >
            {text}
          </text>
          <title>{`${text.replace(' · ', '″ from the left edge, ')}″ from the bottom edge`}</title>
        </g>
      ))}
    </g>
  )
}

function ordinal(step: number) {
  const suffix = step % 100 >= 11 && step % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][step % 10] ?? 'th')
  return `${step}${suffix}`
}

/** A mat ruler prints bare numbers, so the label drops the inch mark to read the same. */
function matInches(value: number) {
  return formatInches(value).replace('″', '')
}

function TerrainMeasurements({
  geometry,
  measurements: all,
  flipped,
  arrowId,
  objectives,
}: {
  geometry: TerrainGeometry
  measurements: Measurement[]
  flipped: boolean
  arrowId: string
  objectives: { x: number; y: number }[]
}) {
  const measurements = [
    ...new Map(
      all.map((measurement) => [`${measurement.from.x}-${measurement.from.y}-${measurement.to.x}-${measurement.to.y}`, measurement]),
    ).values(),
  ]

  const occupied: LabelBox[] = objectives.map((position) => {
    const centre = portraitPoint(position, flipped, geometry.board)
    return { left: centre.x - 1.3, right: centre.x + 1.3, top: centre.y - 1.3, bottom: centre.y + 1.4 }
  })
  for (const area of geometry.areas) {
    for (const marker of area.markers) {
      const centre = portraitPoint(terrainMarkerPosition(area, marker, objectives), flipped, geometry.board)
      occupied.push({ left: centre.x - 1.1, right: centre.x + 1.1, top: centre.y - 1.1, bottom: centre.y + 1.1 })
    }
  }
  for (const join of terrainAreaJoins(geometry)) {
    const centre = portraitPoint(join, flipped, geometry.board)
    occupied.push({ left: centre.x - 0.9, right: centre.x + 0.9, top: centre.y - 0.9, bottom: centre.y + 0.9 })
  }
  // Each badge sits just inside its piece, past the corner from where its arrows come in, so it never hides them.
  const steps = measurements.flatMap((measurement) => {
    if (!measurement.step) return []
    const corner = portraitPoint(measurement.to, flipped, geometry.board)
    const inward = measurements
      .filter((other) => other.to.x === measurement.to.x && other.to.y === measurement.to.y)
      .map((other) => {
        const from = portraitPoint(other.from, flipped, geometry.board)
        const length = Math.hypot(corner.x - from.x, corner.y - from.y) || 1
        return { x: (corner.x - from.x) / length, y: (corner.y - from.y) / length }
      })
      .reduce((sum, direction) => ({ x: sum.x + direction.x, y: sum.y + direction.y }), { x: 0, y: 0 })
    const length = Math.hypot(inward.x, inward.y) || 1
    return [{ step: measurement.step, at: { x: corner.x + (inward.x / length) * 1.1, y: corner.y + (inward.y / length) * 1.1 } }]
  })
  for (const { at } of steps) occupied.push({ left: at.x - 0.6, right: at.x + 0.6, top: at.y - 0.6, bottom: at.y + 0.6 })
  const length = (measurement: Measurement) => Math.hypot(measurement.to.x - measurement.from.x, measurement.to.y - measurement.from.y)
  // Short arrows place their labels first: they have the least room before a label drifts away from its arrow.
  const annotations = measurements
    .map((measurement, index) => ({ measurement, index }))
    .sort((left, right) => length(left.measurement) - length(right.measurement))
    .map(({ measurement, index }) => {
      const from = portraitPoint(measurement.from, flipped, geometry.board)
      const to = portraitPoint(measurement.to, flipped, geometry.board)
      const vertical = Math.abs(from.x - to.x) < Math.abs(from.y - to.y)
      const distance = formatInches(Math.hypot(to.x - from.x, to.y - from.y))
      const edge = vertical ? (from.y < to.y ? 'top' : 'bottom') : from.x < to.x ? 'left' : 'right'
      const text = `${measurement.approximate ? '≈' : ''}${measurement.ruler ? `${distance} from ${edge}` : distance}`
      const label = placeMeasurementLabel(to, from, vertical, text, occupied, geometry.board)
      const { width: labelWidth, height: labelHeight } = measurementLabelSize(text)
      return {
        index,
        key: `${measurement.from.x}-${measurement.from.y}-${measurement.to.x}-${measurement.to.y}-${index}`,
        ruler: measurement.ruler ?? false,
        from,
        to,
        text,
        label,
        labelWidth,
        labelHeight,
      }
    })
    .sort((left, right) => left.index - right.index)

  return (
    <g>
      {annotations.map(({ key, ruler, from, to, label }) =>
        ruler ? (
          <line key={key} x1={to.x} y1={to.y} x2={label.x} y2={label.y} className="stroke-parchment" strokeWidth=".1" />
        ) : (
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
        ),
      )}
      {annotations.map(({ key, ruler, text, label, labelWidth, labelHeight }) => (
        <g key={key}>
          <rect
            x={label.x - labelWidth / 2}
            y={label.y - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            rx=".14"
            className={ruler ? 'fill-parchment' : 'fill-side-a'}
          />
          <text
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className={ruler ? 'fill-parchment-ink' : 'fill-bone'}
            fontSize=".9"
            fontWeight="700"
          >
            {text}
          </text>
        </g>
      ))}
      {[...new Map(annotations.map(({ to }) => [`${to.x}-${to.y}`, to])).values()].map((point) => (
        <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r=".18" className="fill-side-a">
          <title>Measurement endpoint</title>
        </circle>
      ))}
      {steps.map(({ step, at }) => (
        <g key={`step-${step}`}>
          <circle cx={at.x} cy={at.y} r=".55" className="fill-bone stroke-side-a" strokeWidth=".1" />
          <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" className="fill-void" fontSize=".65" fontWeight="800">
            {step}
          </text>
          <title>{`Place this piece ${ordinal(step)}`}</title>
        </g>
      ))}
    </g>
  )
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
