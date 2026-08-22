import { useId } from 'react'

import {
  deploymentNeedsFlip,
  formatInches,
  measurementAnchor,
  measurementLabelSize,
  objectiveTerrainMarkers,
  placeMeasurementLabel,
  pointInPolygon,
  polygonCentroid,
  portraitPoint,
  type LabelBox,
  svgPoints,
  type TerrainGeometry,
  type TerrainPiece,
  type TerrainTemplate,
  terrainMarkerPosition,
} from './terrainGeometry'

export function TerrainBoard({
  layout,
  deployment,
  templates,
  className,
  detailed = false,
  ariaLabel,
}: {
  layout: { name: string; pieces: TerrainPiece[]; geometry: TerrainGeometry | null }
  templates: TerrainTemplate[]
  deployment?: {
    zones: { player: string; name: string; points: { x: number; y: number }[] }[]
    objectives: { x: number; y: number }[]
  }
  className?: string
  detailed?: boolean
  ariaLabel?: string
}) {
  const patternId = useId().replaceAll(':', '')
  const flipped = deploymentNeedsFlip(deployment?.zones ?? [])
  const hasObjectiveTerrain = layout.geometry?.areas.some((area) => area.markers?.length) ?? false

  return (
    <svg viewBox="0 0 44 60" className={`border border-edge bg-sunken ${className ?? ''}`} aria-label={ariaLabel ?? layout.name}>
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
      <rect width="44" height="60" fill={`url(#${patternId}-major)`} />
      <g transform={flipped ? 'translate(44 0) rotate(90)' : 'translate(0 60) rotate(-90)'}>
        <rect width="60" height="44" fill="none" stroke="currentColor" strokeWidth=".25" />
        {deployment?.zones.map((zone) => (
          <polygon
            key={zone.name}
            points={zone.points.map((point) => `${point.x},${point.y}`).join(' ')}
            className={deploymentZoneClass(zone.player)}
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
                className={homeZone ? `fill-void ${deploymentZoneStroke(homeZone.player)}` : 'fill-void stroke-bone'}
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

function ExactTerrainGeometry({
  geometry,
  detailed,
  flipped,
  zones,
}: {
  geometry: TerrainGeometry
  detailed: boolean
  flipped: boolean
  zones: { player: string; points: { x: number; y: number }[] }[]
}) {
  return (
    <>
      {geometry.areas.map((area) => (
        <g key={area.id}>
          <polygon points={svgPoints(area.points)} className="fill-raised/90 stroke-azure" strokeWidth={detailed ? '.18' : '.25'}>
            <title>{area.name}</title>
          </polygon>
          {area.parts.map((part, partIndex) => {
            const stroke = partIndex % 2 === 0 ? 'stroke-discarded' : 'stroke-achieved'
            return (
              <g key={part.id}>
                {part.roof?.length ? (
                  <polygon
                    points={svgPoints(part.roof)}
                    className="fill-bone/10 stroke-bone/55"
                    strokeWidth=".12"
                    strokeDasharray=".3 .2"
                  />
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
                  <title>{`${marker.label} terrain`}</title>
                </g>
              ))
            : null}
        </g>
      ))}
      {detailed
        ? objectiveTerrainMarkers(geometry).map((objective) => (
            <ObjectiveTerrainMarker
              key={objective.key}
              position={objective.position}
              counterRotation={flipped ? -90 : 90}
              homePlayer={zones.find((zone) => pointInPolygon(objective.position, zone.points))?.player}
            />
          ))
        : null}
    </>
  )
}

function ObjectiveTerrainMarker({
  position,
  counterRotation,
  homePlayer,
}: {
  position: { x: number; y: number }
  counterRotation: number
  homePlayer?: string
}) {
  return (
    <g transform={`translate(${position.x} ${position.y}) rotate(${counterRotation})`}>
      <circle
        r="1.08"
        className={homePlayer ? `fill-raised ${deploymentZoneStroke(homePlayer)}` : 'fill-raised stroke-bone'}
        strokeWidth={homePlayer ? '.28' : '.18'}
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
