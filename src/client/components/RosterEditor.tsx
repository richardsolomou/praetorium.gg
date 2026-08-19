import { useState } from 'react'
import type { Secondary, Stratagem } from '../../core/battle'
import { ListBuilder } from './ListBuilder'

type Roster = {
  id: string
  name: string
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: Parameters<typeof ListBuilder>[0]['initial']['picks']
  prep?: { stratagems: Stratagem[]; secondaries: Secondary[] } | null
  visibility: Parameters<typeof ListBuilder>[0]['initial']['visibility']
  source: Parameters<typeof ListBuilder>[0]['initial']['source']
}

type Props = { roster: Roster; editable: boolean }

export function RosterEditor({ roster, editable }: Props) {
  const [prep, setPrep] = useState<{ stratagems: Stratagem[]; secondaries: Secondary[] }>(
    roster.prep ?? { stratagems: [], secondaries: [] },
  )

  return (
    <main className="flex h-full w-full flex-col">
      <ListBuilder prep={prep} onRestorePrep={setPrep} initial={roster} editable={editable} />
    </main>
  )
}
