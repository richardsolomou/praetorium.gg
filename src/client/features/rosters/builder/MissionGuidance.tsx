import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { missionMatchupsFor } from '../../../../core/missionMatchups'
import { gameReferencesQuery } from '../../../queries'

export function MissionGuidance({ disposition }: { disposition: string | null }) {
  const { data } = useQuery({ ...gameReferencesQuery(), enabled: Boolean(disposition) })
  const known = data?.dispositions.find((entry) => entry.id === disposition)
  if (!known || !data || !disposition) return null
  const packs = missionMatchupsFor(data.packs, disposition, data.dispositions)
  if (!packs.length) return null
  return (
    <details className="border-b border-edge py-2 text-xs">
      <summary className="min-h-11 cursor-pointer content-center font-semibold text-info">Mission matchups · {known.name}</summary>
      <Link
        to="/force-dispositions/$dispositionId"
        params={{ dispositionId: disposition }}
        className="inline-flex min-h-11 items-center text-info hover:underline"
      >
        Read {known.name}
      </Link>
      {packs.map((pack) => (
        <div key={pack.id} className="mb-2">
          <h2 className="rubric mb-1">{pack.name}</h2>
          {pack.matchups.map((matchup) => (
            <Link
              key={matchup.opponent}
              to="/missions/$packId/matchups/$you/$opponent"
              params={{ packId: pack.id, you: disposition, opponent: matchup.opponent }}
              className="flex min-h-11 items-center justify-between gap-2 border-t border-edge py-2 hover:text-info"
            >
              <span>vs {matchup.opponentName}</span>
              <span className="text-right text-info">{matchup.mission}</span>
            </Link>
          ))}
        </div>
      ))}
    </details>
  )
}
