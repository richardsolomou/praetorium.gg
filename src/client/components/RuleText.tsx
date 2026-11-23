import { createContext, type ReactNode, useContext, useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { RuleLinks } from '../ruleLinks'
import { Keyword, type KeywordRule } from './Keyword'
import { RuleMarkup } from './RuleMarkup'
import { useRuleSummary } from '../ruleSummaries'
import { RuleSummarySkeleton, RuleSummaryText } from './RuleSummaryText'
import { hasTextTokens } from '../../core/sourceText'

const noRules: KeywordRule[] = []
const Rules = createContext<KeywordRule[]>(noRules)
const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  hr: () => <Separator className="bg-edge" />,
  strong: RuleReference,
}

/**
 * Source prose as the Markdown the page draws.
 *
 * The catalogues underline the odd word with `<ins>`, which says nothing this page
 * renders, so the words inside it stay and the tag goes — unread, it would print
 * itself in the middle of a sentence.
 */
export function ruleMarkdown(text: string) {
  return printedBullets(
    text
      .replaceAll('^^', '')
      .replaceAll(/<\/?ins>/g, '')
      .replaceAll(/^[ \t\u00a0]+/gm, (indent) => indent.replaceAll('\u00a0', ' ')),
  ).replaceAll(/(?<!\*)\[([\p{L}\p{N} +'"’:/\p{Pd}]+)\](?!\*)/gu, '**[$1]**')
}

/** A square the catalogues print after other words on a line, where a quote or bold run opening the line does not count. */
const RUN_IN_BULLET = /(?<=\S)(?<!^[^\S\n]*(?:[‘'"“]|\*\*))[^\S\n]*([■▪•▫◦])(?=[^\S\n])/gm
/** A line the catalogues open with a printed square, their bullet: how deep it is indented, and the quote or bold run it opens. */
const PRINTED_BULLET = /^( *)([‘'"“]|\*\*)?[■▪•▫◦][ \t\u00a0]*(?=\S)/

/**
 * The catalogues' printed bullets as Markdown's. A wargear option lists its choices along
 * one line, so each square there starts a bullet of its own. A bullet never continues onto
 * an unindented line, so such a line is the prose after the list rather than more of its last item.
 */
function printedBullets(text: string) {
  const lines = text.replaceAll(RUN_IN_BULLET, '\n$1').split('\n')
  return lines
    .map((line, at) => {
      const bullet = PRINTED_BULLET.exec(line)
      if (!bullet) return line
      const item = `${bullet[1]}- ${bullet[2] ?? ''}${line.slice(bullet[0].length)}`
      const next = lines[at + 1] ?? ''
      return /^[^\s-]/.test(next) && !PRINTED_BULLET.test(next) ? `${item}\n` : item
    })
    .join('\n')
}

/** A table, and the prose either side of it. Markdown has no table this source's rows fit. */
const TABLE = /<table>[^]*?(?:<\/table>|$)/g

type RuleSegment = { kind: 'markdown' | 'table'; text: string }

/**
 * The prose a page draws as Markdown, and the tables it cannot.
 *
 * A card that rolls on a table writes it as the source's own rows, which the reader
 * in `ruleMarkup` already knows how to draw. Those rows stay whole here and the
 * words around them are read as Markdown, so neither reading has to answer for the
 * other.
 */
export function ruleSegments(text: string): RuleSegment[] {
  const segments: RuleSegment[] = []
  let read = 0
  const prose = (upTo: number) => {
    const markdown = ruleMarkdown(text.slice(read, upTo))
    if (markdown.trim()) segments.push({ kind: 'markdown', text: markdown })
  }
  for (const match of text.matchAll(TABLE)) {
    prose(match.index)
    segments.push({ kind: 'table', text: match[0] })
    read = match.index + match[0].length
  }
  prose(text.length)
  return segments
}

const noLinks: RuleLinks = new Map()

/**
 * A rule as a reader sees it. Praetorium never shows a source's own wording: a rule the source prints, which
 * the text names by token, shows its VS Data summary or nothing at all. `authored` marks words the app writes itself.
 */
export function RuleText({
  text,
  rules = noRules,
  className,
  authored = false,
}: {
  text: string
  rules?: KeywordRule[]
  className?: string
  authored?: boolean
}) {
  if (hasTextTokens(text)) return <SummarizedRule text={text} className={className} />
  return authored ? <RuleTextBody text={text} rules={rules} className={className} /> : null
}

function SummarizedRule({ text, className }: { text: string; className?: string }) {
  const { summary, pending } = useRuleSummary(text)
  if (pending) return <RuleSummarySkeleton className={className} />
  return summary ? <RuleSummaryText summary={summary} className={className} /> : null
}

function RuleTextBody({ text, rules, className }: { text: string; rules: KeywordRule[]; className?: string }) {
  const segments = useMemo(() => ruleSegments(text), [text])
  return (
    <Rules value={rules}>
      <div className={cn('mt-2 space-y-2 font-rules text-sm text-dim', className)}>
        {segments.map((segment, at) => {
          const key = `${segment.kind}-${at}`
          if (segment.kind === 'table') return <RuleMarkup key={key} markup={segment.text} links={noLinks} />
          return (
            <Markdown key={key} components={components}>
              {segment.text}
            </Markdown>
          )
        })}
      </div>
    </Rules>
  )
}

function RuleReference({ children }: { children?: ReactNode }) {
  const rules = useContext(Rules)
  const name = typeof children === 'string' ? children : null
  return <strong className="font-semibold text-bone">{name ? <Keyword name={name} rules={rules} /> : children}</strong>
}
