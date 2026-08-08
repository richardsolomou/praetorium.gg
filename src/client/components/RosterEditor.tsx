import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Secondary, Stratagem } from '../../core/battle'
import { savedRostersQuery } from '../queries'
import { ListBuilder } from './ListBuilder'

type Props = { rosterId?: string; openImport?: boolean }

export function RosterEditor({ rosterId, openImport = false }: Props) {
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const initial = rosterId ? saved.find((roster) => roster.id === rosterId) : undefined
  const [prep, setPrep] = useState<{ stratagems: Stratagem[]; secondaries: Secondary[] }>(
    initial?.prep ?? { stratagems: [], secondaries: [] },
  )

  return (
    <main className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-4 py-4">
      {initial ? null : (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Your rosters</p>
            <h1 className="text-xl leading-tight sm:text-2xl">{openImport ? 'Import roster' : 'Create editable roster'}</h1>
          </div>
          <Button render={<Link to="/rosters" />} variant="outline">
            Back to rosters
          </Button>
        </div>
      )}
      <ListBuilder prep={prep} onRestorePrep={setPrep} initial={initial} openImport={openImport} />
    </main>
  )
}
