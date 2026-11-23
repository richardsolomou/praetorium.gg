import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import type { RuleSummary, RuleSummarySpan } from '../../contracts/rules'
import { summarySegments } from '../../core/summarySpans'

/**
 * A VS Data summary, which everyone can read: original wording that names the publisher document it was
 * checked against, and says where the official text leaves a point open. Its spans are drawn as they
 * stand, never read as Markdown, so the summary cannot mark itself up.
 */
export function RuleSummaryText({ summary, className }: { summary: RuleSummary; className?: string }) {
  const { citation } = summary
  return (
    <div data-rule-summary className={cn('mt-2 space-y-1.5 font-rules text-sm text-dim', className)}>
      <p>
        {summarySegments(summary.summary, summary.spans).map((segment) => (
          <Segment key={segment.start} text={segment.text} span={segment.span} />
        ))}
      </p>
      {summary.questions.map((question) => (
        <p key={question} className="font-sans text-xs text-faint italic">
          The official text leaves this open: {question}
        </p>
      ))}
      <p className="font-sans text-xs text-faint">
        <span>VS Data summary</span>
        {citation ? (
          <>
            {' · '}
            <a href={citation.url} target="_blank" rel="noopener" className="hover:text-bone">
              {citation.page ? `${citation.title}, p. ${citation.page}` : citation.title}
            </a>
          </>
        ) : null}
      </p>
    </div>
  )
}

function Segment({ text, span }: { text: string; span?: RuleSummarySpan }) {
  const shown = span?.bold ? <strong className="font-semibold text-bone">{text}</strong> : text
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
