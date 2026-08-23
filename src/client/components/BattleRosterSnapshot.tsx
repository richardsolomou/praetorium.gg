import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import type { Roster } from '../../core/battle'
import { GAME_SIZES } from '../../core/battle'
import { factionsQuery } from '../queries'
import { FactionLabel } from './FactionMark'
import { GROUPS } from './builder/groups'
import { Section } from './builder/Section'
import { UnitCard } from './builder/UnitCard'

export function BattleRosterSnapshot({ roster }: { roster: Roster }) {
  const { data: available } = useQuery(factionsQuery())
  const built = roster.built
  const hasRosterCards = built?.units.some((unit) => unit.group !== undefined) ?? false
  const faction = available?.factions.find((entry) => entry.id === built?.catalogueId)

  return (
    <main className="flex h-full w-full flex-col">
      <div data-roster-builder className="flex min-h-0 flex-1 flex-col border border-edge bg-sunken">
        <header className="border-b border-edge px-3 py-2">
          <Input
            value={roster.name}
            aria-label="List name"
            readOnly
            className="h-8 border-0 bg-transparent px-0 text-lg font-bold tracking-[0.02em] uppercase focus-visible:ring-0"
          />
          {built ? (
            <div className="flex min-w-0 items-center gap-2 text-xs text-dim">
              {faction ? (
                <Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }} className="truncate text-info hover:text-bone">
                  <FactionLabel faction={faction} />
                </Link>
              ) : null}
              {faction ? <span aria-hidden>·</span> : null}
              <Link to="/rosters" search={{ limit: built.limit }} className="shrink-0 text-info hover:text-bone">
                {GAME_SIZES.find((size) => size.limit === built.limit)?.name ?? `${built.limit} points`}
              </Link>
              {(built.detachments ?? (built.detachment ? [{ name: built.detachment, points: null }] : [])).map((detachment) => (
                <span key={detachment.name} className="contents">
                  <span aria-hidden>·</span>
                  <span>{detachment.name}</span>
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {hasRosterCards && built ? (
            GROUPS.map(({ id, plural }) => {
              const units = built.units.filter((unit) => (unit.group ?? 'other') === id)
              return units.length ? (
                <Section key={id} title={plural} count={units.length}>
                  {units.map((unit) => (
                    <UnitCard
                      key={unit.key}
                      unit={{
                        entryId: unit.entryId ?? unit.key,
                        name: unit.name,
                        points: unit.points,
                        wargear: unit.wargear ?? [],
                        attachment: null,
                        enhancements: unit.enhancements ?? [],
                        upgrades: unit.upgrades ?? [],
                      }}
                      selected={false}
                      onRemove={() => undefined}
                      onDuplicate={() => undefined}
                      owned={false}
                      onOwned={() => undefined}
                      joined={(unit.joined ?? []).map((row) => ({ ...row, action: '', onAct: () => undefined }))}
                      canJoin={[]}
                      onJoin={() => undefined}
                      editable={false}
                    />
                  ))}
                </Section>
              ) : null
            })
          ) : (
            <pre className="my-3 overflow-auto whitespace-pre-wrap border border-edge bg-panel p-3 font-rules text-sm select-text">
              {roster.text}
            </pre>
          )}
        </div>
      </div>
    </main>
  )
}
