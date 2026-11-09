import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Calculator } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { battleQuery, battlesFrom, battlesQuery, meQuery } from '../../queries'
import { useSpacetimeLiveBattle } from '../../spacetimeLive'
import { BattleCombatDialog } from './BattleCombatDialog'

/** The signed-in player's battles in progress, so the standalone page can start from their units' current health. */
export function LiveBattles() {
  const { data: me } = useQuery(meQuery())
  const { data } = useInfiniteQuery({ ...battlesQuery(), enabled: Boolean(me) })
  const [token, setToken] = useState<string | null>(null)
  const playing = battlesFrom(data).filter((battle) => battle.status === 'playing')
  if (!playing.length) return null
  return (
    <section aria-label="Battles in progress" className="part my-4 space-y-2 p-3">
      <p className="eyebrow">In a battle?</p>
      <p className="text-sm text-dim">Simulate with your units' current models and wounds.</p>
      <div className="flex flex-wrap gap-2">
        {playing.map((battle) => (
          <Button key={battle.token} variant="secondary" size="sm" onClick={() => setToken(battle.token)}>
            <Calculator aria-hidden /> {battle.players.join(' vs ')} · Round {battle.round}
          </Button>
        ))}
      </div>
      {token ? <LiveBattleCombat token={token} onClose={() => setToken(null)} /> : null}
    </section>
  )
}

function LiveBattleCombat({ token, onClose }: { token: string; onClose: () => void }) {
  const { data: screen } = useQuery({ ...battleQuery(token), staleTime: 0 })
  useSpacetimeLiveBattle(token, true)
  if (!screen || screen.kind === 'unavailable') return null
  return <BattleCombatDialog view={screen.view} selection={{ playerId: screen.view.viewerId }} onClose={onClose} />
}
