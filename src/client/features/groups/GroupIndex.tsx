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
import { SEALED_EVENT_CARD, SEALED_EVENT_ROWS } from '../sealedEvents/SealedEventActions'
import { GroupSettingsDialog } from './GroupSettingsDialog'
import { countLabel } from '../../text'
import { GuideHelp } from '../onboarding/GuideHelp'
import { advanceOnboarding } from '../onboarding/onboarding'
import { nameColour } from '../../playerName'

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
        title="Groups"
        description="Keep a running leaderboard of the games your group plays."
        actions={
          me ? (
            <Button
              data-onboarding="create-group"
              onClick={() => {
                advanceOnboarding('group', 'group-start', 'group-access')
                setCreating(true)
              }}
            >
              <Plus /> New group
            </Button>
          ) : null
        }
        help={me ? <GuideHelp task="group">Group guide</GuideHelp> : null}
      />
      <PageContent className="space-y-6">
        {mine.length ? <GroupShelf title="Your groups" groups={mine} /> : null}
        {publicGroups.length ? <GroupShelf title="Public groups" groups={publicGroups} /> : null}
        {!groups.length ? (
          <PageState
            headingLevel={2}
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
      <div className={SEALED_EVENT_ROWS}>
        {groups.map((group) => {
          return (
            <article key={group.id} data-group={group.token} className={SEALED_EVENT_CARD}>
              <Link
                to="/groups/$token"
                params={{ token: group.token }}
                className="group flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1.5 px-2 py-3"
              >
                <div className="min-w-0 flex-[1_1_18rem]">
                  <h3 className="truncate text-lg leading-tight group-hover:underline">{group.name}</h3>
                  <p className="mt-1 flex items-center gap-2 text-2xs text-dim">
                    <VisibilityIcon visibility={group.visibility} labelled />
                    <span className="truncate">{admissionLabel(group.admission)}</span>
                  </p>
                  {group.description ? (
                    <p className="mt-1 line-clamp-1 text-sm text-dim">{group.description}</p>
                  ) : (
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-dim">
                      <PlayerAvatar name={group.ownerName} image={group.ownerImage} className="size-5 text-3xs" />
                      <span className="truncate">
                        Run by <span style={nameColour({ id: group.ownerId, colour: group.ownerColour })}>{group.ownerName}</span>
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 shrink-0 items-baseline gap-3 text-sm sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
                  {/* A request still waiting is the one thing about the reader worth saying; otherwise, how lively the group is. */}
                  {group.ownMember?.status === 'pending' ? (
                    <span className="truncate font-semibold text-discarded">Request sent</span>
                  ) : (
                    <span className="truncate text-dim">
                      {group.lastBattleAt ? `Last game ${date(group.lastBattleAt)}` : 'No games yet'}
                    </span>
                  )}
                  <span className="shrink-0 text-2xs text-faint readout max-sm:ml-auto">
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
