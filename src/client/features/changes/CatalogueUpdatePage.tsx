import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { PageContent, PageHeader } from '../../components/Page'
import { catalogueUpdateQuery } from '../../queries'
import { changesLabel, UpdateChanges, updateTime } from './UpdateChanges'

/** Everything one army data update changed, each faction's part addressed by its anchor. */
export function CatalogueUpdatePage({ id }: { id: string }) {
  const { data: update } = useQuery(catalogueUpdateQuery(id))
  if (!update) return null
  const factions = update.factions.length
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Data update"
        title={updateTime(update.recordedAt)}
        description={`${changesLabel(update.total)} across ${factions} ${factions === 1 ? 'faction' : 'factions'}.`}
      />
      <PageContent className="space-y-4">
        <Link to="/changes" className="inline-flex items-center gap-1 text-sm text-info hover:text-bone">
          <ArrowLeft className="size-3.5" aria-hidden /> All data updates
        </Link>
        <UpdateChanges update={update} anchored />
      </PageContent>
    </main>
  )
}
