import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { IdentityGate } from '../client/components/IdentityGate'
import { ListBuilder } from '../client/components/ListBuilder'
import { meQuery } from '../client/queries'
import type { Secondary, Stratagem } from '../core/battle'

export const Route = createFileRoute('/rosters')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: Rosters,
})

function Rosters() {
  const { data: me } = useSuspenseQuery(meQuery())
  const [prep, setPrep] = useState<{ stratagems: Stratagem[]; secondaries: Secondary[] }>({ stratagems: [], secondaries: [] })
  if (!me) return <IdentityGate />

  return (
    <main className="mx-auto flex h-[calc(100dvh-5rem)] w-full max-w-[1600px] flex-col px-4 py-4">
      <div className="mb-3">
        <p className="eyebrow">Your rosters</p>
        <h1 className="text-2xl">Build an army</h1>
      </div>
      <ListBuilder prep={prep} onRestorePrep={setPrep} />
    </main>
  )
}
