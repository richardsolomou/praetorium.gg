import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { buttonClass } from '../../components/buttonClass'
import { FullPageState } from '../../components/PageState'
import { battleQuery } from '../../queries'
import { SAMPLE_BATTLE_TOKEN } from '../../../contracts/battles'
import { Spectator } from './Spectator'

const POINTS = [
  { title: 'Replay', text: 'Drag the timeline below to any moment of the game.' },
  { title: 'Command points', text: 'Filter Battle events to CP only for what each side gained and spent.' },
  { title: 'Mission cards', text: 'Each card shows what it scored, round by round.' },
  { title: 'Your record', text: 'The result counts in each player’s record and moves their rating, like Aurelia’s +14.' },
]

const followed = (action: 'roster' | 'battle') => () => posthog.capture('sample_battle_followed', { action })

/**
 * A made-up finished game drawn with the real battle screen, seen from one of its seats, so a player
 * can see what tracking gives them before starting a game of their own. Nothing here is stored.
 */
export function BattleSample() {
  const { data: screen } = useQuery(battleQuery(SAMPLE_BATTLE_TOKEN))
  if (screen?.kind !== 'spectator') return <FullPageState title="The sample battle is not available" explanation="Try again in a moment." />
  return (
    <Spectator
      view={screen.view}
      clock={screen.clock}
      missions={screen.missions}
      report={screen.report}
      timeline={screen.timeline}
      lead={
        <aside aria-labelledby="battle-sample-title" className="space-y-3 part border-info/40 p-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="chip text-info">Sample</span>
              <h2 id="battle-sample-title" className="text-sm font-semibold text-bone">
                A made-up game, seen from Aurelia’s seat
              </h2>
            </div>
            <p className="text-xs text-dim">
              Two lists from the army builder, tracked over five rounds. Nothing here is saved or counts anywhere.
            </p>
          </div>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {POINTS.map((point) => (
              <li key={point.title} className="text-xs text-dim">
                <span className="font-semibold text-bone">{point.title}.</span> {point.text}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link to="/rosters" onClick={followed('roster')} className={buttonClass({ size: 'sm', className: 'max-sm:h-11' })}>
              Build an army
            </Link>
            <Link
              to="/battles"
              onClick={followed('battle')}
              className={buttonClass({ variant: 'outline', size: 'sm', className: 'max-sm:h-11' })}
            >
              Start a battle
            </Link>
          </div>
        </aside>
      }
    />
  )
}
