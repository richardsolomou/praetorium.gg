import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { useDateFormatting } from '../../dates'
import { countLabel } from '../../text'
import { SectionHeading } from '../../components/SectionHeading'

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
      <SectionHeading title="Updates for your armies" />
      <ul className="part divide-y divide-edge overflow-hidden">
        {newest.map(({ faction, recordedAt, anchor, changes }) => (
          <li key={faction.slug}>
            <Link
              to="/data-updates/$catalogueId"
              params={{ catalogueId: faction.slug }}
              hash={anchor}
              className="flex min-w-0 items-center gap-2.5 px-4 py-3 transition-colors hover:bg-raised"
            >
              <FactionMark faction={faction} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-bold">{faction.displayName}</span>
                <span className="block text-xs text-dim">
                  {countLabel(changes, 'change')} · {date(recordedAt)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
