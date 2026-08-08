import { useQuery } from '@tanstack/react-query'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { BattleView, Command } from '../../core/battle'
import { deploymentsQuery } from '../queries'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean }

/**
 * The drawing area, taken from the pattern itself rather than assumed.
 *
 * A board size hardcoded here would be wrong the moment a pattern used another one,
 * and the first version of this drew every zone squashed into one corner by
 * guessing.
 */
function bounds(zones: { points: { x: number; y: number }[] }[], objectives: { x: number; y: number }[]) {
  const points = [...zones.flatMap((zone) => zone.points), ...objectives]
  if (!points.length) return { width: 60, height: 44 }
  return {
    width: Math.max(...points.map((point) => point.x)),
    height: Math.max(...points.map((point) => point.y)),
  }
}

/**
 * The battlefield: which deployment the two of you are using, drawn rather than
 * described, and who is putting what on the table.
 *
 * The zones arrive as polygons, so this is a faithful picture of the pattern rather
 * than a name to look up in a book. Either player may set it — the table is shared —
 * and only before the first turn, since deployment zones do not move mid-battle.
 */
export function Battlefield({ view, send, pending }: Props) {
  const { data: patterns } = useQuery(deploymentsQuery())
  const chosen = patterns?.find((pattern) => pattern.id === view.deploymentId)

  if (!patterns?.length) return null

  const board = chosen ? bounds(chosen.zones, chosen.objectives) : { width: 60, height: 44 }

  return (
    <section className="space-y-3">
      <Label>Battlefield</Label>
      <ToggleGroup
        value={view.deploymentId ? [view.deploymentId] : []}
        onValueChange={(value) => send({ kind: 'set-deployment', patternId: value.at(-1) ?? null })}
        disabled={pending}
        variant="outline"
        className="flex-wrap"
      >
        {patterns.map((pattern) => {
          return (
            <ToggleGroupItem key={pattern.id} size="sm" value={pattern.id}>
              {pattern.name}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>

      {chosen ? (
        <figure className="space-y-2">
          <svg
            viewBox={`-1 -1 ${board.width + 2} ${board.height + 2}`}
            className="w-full rounded-md border border-edge bg-void"
            aria-label={`${chosen.name} deployment zones`}
          >
            {/* Named on the element itself: an inline drawing cannot be an `img` tag. */}
            <title>{`${chosen.name} deployment zones`}</title>
            {/* The table edge, so the zones read as part of a board. */}
            <rect x={0} y={0} width={board.width} height={board.height} fill="none" stroke="#2b3138" strokeWidth={0.3} />
            {chosen.zones.map((zone) => (
              <polygon
                key={`${zone.name}-${zone.player}`}
                points={zone.points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill={zone.colour}
                fillOpacity={0.28}
                stroke={zone.colour}
                strokeWidth={0.3}
              />
            ))}
            {/* The markers the game is actually fought over. */}
            {chosen.objectives.map((objective) => (
              <circle
                key={`${objective.x}-${objective.y}`}
                cx={objective.x}
                cy={objective.y}
                r={1.6}
                fill="none"
                stroke="#e0a340"
                strokeWidth={0.4}
              />
            ))}
          </svg>
          <figcaption className="text-xs text-dim">{chosen.description ?? chosen.name}</figcaption>
        </figure>
      ) : (
        <p className="text-xs text-dim">Pick one and it will be drawn here.</p>
      )}
    </section>
  )
}
