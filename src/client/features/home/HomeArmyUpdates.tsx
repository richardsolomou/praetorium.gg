import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { useDateFormatting } from '../../dates'
import { countLabel } from '../../text'

/** How many armies the panel names, the most recently updated first. */
const SHOWN = 3

/** The newest data update that reached one of the player's armies. */
export type ArmyUpdate = { faction: FactionPresentation; recordedAt: number; anchor: string; changes: number }

/** The armies the player's listed rosters field, each once, in the order the lists are shown. */
export function armySlugs(factions: readonly (FactionPresentation | undefined)[]) {
  return [...new Set(factions.flatMap((faction) => (faction ? [faction.slug] : [])))]
}

/**
 * When the data for each army the player builds last changed, and how much.
 *
 * A points or datasheet change is what sends a player back to a finished list, so
 * this names it before they find out at the table. Each row opens that update on
 * the army's own updates page.
 */
export function HomeArmyUpdates({ updates }: { updates: readonly ArmyUpdate[] }) {
  const { date } = useDateFormatting()
  if (!updates.length) return null
  const newest = updates.toSorted((one, other) => other.recordedAt - one.recordedAt).slice(0, SHOWN)
  return (
    <section data-home-army-updates>
      <h2 className="rubric border-b border-edge pb-2">Updates for your armies</h2>
      <ul className="divide-y divide-edge border-b border-edge">
        {newest.map(({ faction, recordedAt, anchor, changes }) => (
          <li key={faction.slug}>
            <Link
              to="/data-updates/$catalogueId"
              params={{ catalogueId: faction.slug }}
              hash={anchor}
              className="-mx-3 flex min-w-0 items-center gap-2 px-3 py-3 hover:bg-raised"
            >
              <FactionMark faction={faction} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold uppercase">{faction.displayName}</span>
                <span className="block text-xs text-dim">
                  {countLabel(changes, 'change')} · {date(recordedAt)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-info" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
