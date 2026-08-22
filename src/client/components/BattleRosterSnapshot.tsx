import { Link } from '@tanstack/react-router'
import type { Roster } from '../../core/battle'
import { GAME_SIZES } from '../../core/battle'
import { GROUPS } from './builder/groups'
import { Section } from './builder/Section'
import { UnitCard } from './builder/UnitCard'

export function BattleRosterSnapshot({ roster, token }: { roster: Roster; token: string }) {
  const built = roster.built
  const points = built?.units.reduce((total, unit) => total + unit.points, 0) ?? 0

  return (
    <main className="flex h-full w-full flex-col px-3 py-3 sm:px-4 sm:py-4">
      <Link to="/battles/$token" params={{ token }} className="eyebrow mb-3 w-fit text-info">
        Back to battle
      </Link>
      <div data-roster-builder className="flex min-h-0 flex-1 flex-col border border-edge bg-sunken">
        <header className="border-b border-edge px-3 py-2">
          <h1 className="text-lg font-bold tracking-[0.02em] uppercase">{roster.name}</h1>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-dim">
            <span>
              {GAME_SIZES.find((size) => size.limit === built?.limit)?.name ?? (built ? `${built.limit} points` : 'Fielded roster')}
            </span>
            {built?.detachments?.map((detachment) => (
              <span key={detachment.name} className="contents">
                <span aria-hidden>·</span>
                <span>{detachment.name}</span>
              </span>
            )) ??
              (built?.detachment ? (
                <span className="contents">
                  <span aria-hidden>·</span>
                  <span>{built.detachment}</span>
                </span>
              ) : null)}
            {built ? (
              <span className="ml-auto chip text-info">
                {points}/{built.limit} pts
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-faint">Fielded snapshot · Later roster changes do not affect this battle.</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {built?.units.length ? (
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
