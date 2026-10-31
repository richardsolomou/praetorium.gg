import { admissionLabel, VisibilityIcon } from '../sealedEvents/EventAccess'
import { SectionHeading } from '../../components/SectionHeading'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { useDateFormatting } from '../../dates'
import { groupsQuery, meQuery, type QueryData } from '../../queries'
import { SEALED_EVENT_CARD } from '../sealedEvents/SealedEventActions'
import { GroupSettingsDialog } from './GroupSettingsDialog'
import { countLabel } from '../../text'

type GroupSummary = QueryData<typeof groupsQuery>[number]

export function GroupIndex() {
  const { data: me } = useQuery(meQuery())
  const { data: groups = [] } = useQuery(groupsQuery())
  const [creating, setCreating] = useState(false)
  const mine = groups.filter((group) => group.ownMember)
  const publicGroups = groups.filter((group) => !group.ownMember)
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Events"
        title="Groups"
        description="Keep a running leaderboard of the games your group plays."
        actions={
          me ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New group
            </Button>
          ) : null
        }
      />
      <PageContent className="space-y-6">
        {mine.length ? <GroupShelf title="Your groups" groups={mine} /> : null}
        {publicGroups.length ? <GroupShelf title="Public groups" groups={publicGroups} /> : null}
        {!groups.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Play with your group"
            title="No groups yet"
            explanation={me ? 'Start one and send the link to your group.' : 'Public groups show up here. Sign in to start one.'}
            icon={Users}
          />
        ) : null}
      </PageContent>
      <GroupSettingsDialog group={null} open={creating} onOpenChange={setCreating} />
    </main>
  )
}

function GroupShelf({ title, groups }: { title: string; groups: readonly GroupSummary[] }) {
  const { date } = useDateFormatting()
  return (
    <section>
      <SectionHeading title={title} count={groups.length} />
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => {
          return (
            <article key={group.id} data-group={group.token} className={SEALED_EVENT_CARD}>
              <Link to="/groups/$token" params={{ token: group.token }} className="flex min-w-0 flex-1 flex-col">
                <div className="flex-1 p-4">
                  <p className="flex items-center gap-2 text-xs text-dim">
                    <VisibilityIcon visibility={group.visibility} labelled />
                    <span className="truncate tracking-label uppercase">{admissionLabel(group.admission)}</span>
                  </p>
                  <h3 className="mt-1.5 truncate text-lg leading-tight font-bold uppercase">{group.name}</h3>
                  {group.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-dim">{group.description}</p>
                  ) : (
                    <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-dim">
                      <PlayerAvatar name={group.ownerName} image={group.ownerImage} className="size-5 text-3xs" />
                      <span className="truncate">Run by {group.ownerName}</span>
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 items-center gap-3 border-t border-edge bg-sunken/60 px-4 py-2.5 text-sm">
                  {/* A request still waiting is the one thing about the reader worth saying; otherwise, how lively the group is. */}
                  {group.ownMember?.status === 'pending' ? (
                    <span className="truncate font-semibold text-discarded">Request sent</span>
                  ) : (
                    <span className="truncate text-dim">
                      {group.lastBattleAt ? `Last game ${date(group.lastBattleAt)}` : 'No games yet'}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-dim readout">
                    {countLabel(group.memberCount, 'member')} · {countLabel(group.battleCount, 'game')}
                  </span>
                </div>
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
