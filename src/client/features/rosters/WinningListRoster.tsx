import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, Download, ExternalLink, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { FullPageState, PageLoading } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { factionQuery, winningListQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { countLabel } from '../../text'
import { ListBuilder } from './ListBuilder'
import { NO_PREP } from './rosterDraft'
import { openWinningImport } from './winningListImport'
import { placingLabel } from './WinningListsPage'

/** A winning list read in the roster screen before anyone imports it, with the way to import it. */
export function WinningListRoster({ id }: { id: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const fromList = useRouterState({ select: (state) => Boolean((state.location.state as { fromWinningLists?: boolean }).fromWinningLists) })
  const result = useQuery(winningListQuery(id))
  const found = result.data
  const faction = useQuery({ ...factionQuery(found?.list.catalogueId ?? ''), enabled: Boolean(found) }).data
  const open = useMutation({ mutationFn: () => (found ? openWinningImport(navigate, found.list, found.text) : Promise.resolve()) })

  if (result.isPending) return <PageLoading />
  if (!found)
    return (
      <FullPageState
        title="List not available"
        explanation="This list no longer imports cleanly under today’s data, or it has left the window."
        icon={Trophy}
        action={
          <Link to="/rosters" search={{ view: 'winning' }} className={buttonClass({ variant: 'outline' })}>
            <ArrowLeft /> Winning lists
          </Link>
        }
      />
    )

  const { list, units } = found
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge px-3 py-2 text-xs text-dim">
        <Link
          to="/rosters"
          search={{ view: 'winning' }}
          className={buttonClass({ variant: 'ghost', size: 'sm' })}
          onClick={(event) => {
            // Opened from the list, going back returns to it exactly as it was left: its filters, search and place.
            if (!fromList) return
            event.preventDefault()
            router.history.back()
          }}
        >
          <ArrowLeft /> Winning lists
        </Link>
        <span className="chip shrink-0">{placingLabel(list.placing)}</span>
        <span className="shrink-0">{list.record}</span>
        {list.event.url ? (
          <a href={list.event.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 underline">
            <span className="truncate">{list.event.name}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        ) : (
          <span className="min-w-0 truncate">{list.event.name}</span>
        )}
        {list.event.players ? <span className="shrink-0">{countLabel(list.event.players, 'player')}</span> : null}
        <Button size="sm" className="ml-auto" disabled={open.isPending} onClick={() => open.mutate()}>
          <Download /> {open.isPending ? 'Opening…' : 'Import'}
        </Button>
      </div>
      {open.isError ? <Problem>Could not open that list: {errorMessage(open.error)}</Problem> : null}
      <ListBuilder
        key={list.id}
        prep={NO_PREP}
        initial={{
          id: '',
          name: list.name,
          catalogueId: list.catalogueId,
          detachmentIds: list.detachmentIds,
          disposition: list.disposition,
          limit: list.limit,
          pointsBudget: null,
          picks: units,
          waivedRules: [],
          visibility: 'private',
          source: 'editable',
        }}
        initialFaction={faction}
        editable={false}
        resolvePersistedRoster={false}
      />
    </main>
  )
}
