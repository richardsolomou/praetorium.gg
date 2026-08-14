import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Secondary, Stratagem } from '../../core/battle'
import { savedRostersQuery } from '../queries'
import { ListBuilder } from './ListBuilder'

type Props = { rosterId?: string }

export function RosterEditor({ rosterId }: Props) {
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const initial = rosterId ? saved.find((roster) => roster.id === rosterId) : undefined
  const [prep, setPrep] = useState<{ stratagems: Stratagem[]; secondaries: Secondary[] }>(
    initial?.prep ?? { stratagems: [], secondaries: [] },
  )

  return (
    <main className="flex h-full w-full flex-col">
      {initial ? null : (
        <div className="m-4 mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Your rosters</p>
            <h1 className="text-xl leading-tight sm:text-2xl">Create editable roster</h1>
          </div>
          <Button render={<Link to="/rosters" />} variant="outline">
            Back to rosters
          </Button>
        </div>
      )}
      <ListBuilder prep={prep} onRestorePrep={setPrep} initial={initial} />
    </main>
  )
}
