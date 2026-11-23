import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { RuleSummary, RuleSummarySpan } from '../../contracts/rules'
import { summarySegments } from '../../core/summarySpans'
import { titleCaseAbility } from '../../shared/catalogueAbilityGrants'
import { useAbilitySummary } from '../ruleSummaries'
import { HoverTooltip } from './HoverTooltip'

/**
 * A VS Data summary, which everyone can read: original wording that says where the official text leaves a
 * point open. Its spans are drawn as they stand, never read as Markdown, so the summary cannot mark itself up.
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
      <p>
        {summarySegments(summary.summary, summary.spans).map((segment) => (
          <Segment
            key={segment.start}
            text={segment.text}
            span={abilities ? segment.span : segment.span && { ...segment.span, ability: undefined }}
          />
        ))}
      </p>
      {summary.questions.map((question) => (
        <p key={question} className="font-sans text-xs text-faint italic">
          The official text leaves this open: {question}
        </p>
      ))}
    </div>
  )
}

function Segment({ text, span }: { text: string; span?: RuleSummarySpan }) {
  const shown = span?.bold ? <strong className="font-semibold text-bone">{text}</strong> : text
  if (span?.ability) return <AbilitySegment text={text} ability={span.ability} shown={shown} />
  if (!span?.link) return shown
  return (
    <Link
      to="/rules/$documentId/$sectionId"
      params={{ documentId: span.link.document, sectionId: span.link.section }}
      hash={span.link.anchor}
      className="text-info hover:text-parchment"
    >
      {shown}
    </Link>
  )
}

/** An ability the summary names, such as `[RAPID FIRE 1]`, printed as it stands and opening that ability's summary. */
function AbilitySegment({ text, ability, shown }: { text: string; ability: string; shown: ReactNode }) {
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
