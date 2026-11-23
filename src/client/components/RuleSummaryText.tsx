import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { RuleSummary, RuleSummaryInline } from '../../contracts/rules'
import { titleCaseAbility } from '../../shared/catalogueAbilityGrants'
import { useAbilitySummary } from '../ruleSummaries'
import { HoverTooltip } from './HoverTooltip'

/**
 * A VS Data summary, which everyone can read: original wording that says where the official text leaves a point open.
 * Its paragraphs, lists and runs are drawn from the blocks the server read, so the summary cannot mark itself up further.
 */
export function RuleSummaryText({
  summary,
  className,
  abilities = true,
}: {
  summary: RuleSummary
  className?: string
  /** Whether the abilities it names open their own summaries, which one shown in a tooltip does not. */
  abilities?: boolean
}) {
  return (
    <div data-rule-summary className={cn('mt-2 space-y-1.5 font-rules text-sm text-dim', className)}>
      {summary.blocks.map((block) =>
        'paragraph' in block ? (
          <p key={textOf(block.paragraph)}>
            <Runs runs={block.paragraph} abilities={abilities} />
          </p>
        ) : (
          <List key={block.items.map(textOf).join('\n')} ordered={block.list === 'ordered'}>
            {block.items.map((item) => (
              <li key={textOf(item)}>
                <Runs runs={item} abilities={abilities} />
              </li>
            ))}
          </List>
        ),
      )}
      {summary.questions.map((question) => (
        <p key={question} className="font-sans text-xs text-faint italic">
          The official text leaves this open: {question}
        </p>
      ))}
    </div>
  )
}

/** What stands in a summary's place while it is asked for, in the size of a short one. */
export function RuleSummarySkeleton({ className }: { className?: string }) {
  return (
    <div data-rule-summary-loading aria-hidden className={cn('mt-2 space-y-1.5', className)}>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  )
}

function List({ ordered, children }: { ordered: boolean; children: ReactNode }) {
  const className = cn('space-y-0.5 pl-4', ordered ? 'list-decimal' : 'list-disc')
  return ordered ? <ol className={className}>{children}</ol> : <ul className={className}>{children}</ul>
}

const textOf = (runs: readonly RuleSummaryInline[]) => runs.map((run) => run.text).join('')

/** A line's runs, each keyed by where it starts in the line. */
function Runs({ runs, abilities }: { runs: readonly RuleSummaryInline[]; abilities: boolean }) {
  let start = 0
  return runs.map((run) => {
    const key = start
    start += run.text.length
    return <Run key={key} run={abilities ? run : { ...run, ability: undefined }} />
  })
}

function Run({ run }: { run: RuleSummaryInline }) {
  const shown = run.bold ? <strong className="font-semibold text-bone">{run.text}</strong> : run.text
  if (run.ability) return <AbilityRun text={run.text} ability={run.ability} shown={shown} />
  if (!run.link) return shown
  return (
    <Link
      to="/rules/$documentId/$sectionId"
      params={{ documentId: run.link.document, sectionId: run.link.section }}
      hash={run.link.anchor}
      className="text-info hover:text-parchment"
    >
      {shown}
    </Link>
  )
}

/** An ability the summary names, such as `[RAPID FIRE 1]`, printed as it stands and opening that ability's summary. */
function AbilityRun({ text, ability, shown }: { text: string; ability: string; shown: ReactNode }) {
  const summary = useAbilitySummary({ key: ability })
  if (!summary) return shown
  return (
    <HoverTooltip
      title={titleCaseAbility(text.replaceAll(/^\[|\]$/g, ''))}
      body={<RuleSummaryText summary={summary} className="mt-0 text-xs" abilities={false} />}
      className="font-semibold text-parchment hover:text-bone"
    >
      {text}
    </HoverTooltip>
  )
}
