import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { useTextSourceChoice } from '../rulesText'
import Markdown, { type Components } from 'react-markdown'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { RuleLinks } from '../ruleLinks'
import { Keyword, type KeywordRule } from './Keyword'
import { CitedRules } from './CitedRules'
import { RuleMarkup } from './RuleMarkup'
import { SourceTextPrompt } from './SourceTextPrompt'
import { useSourceText } from '../sourceText'
import { hasTextTokens } from '../../shared/sourceText'

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
 * Rules text, shown once the reader has chosen to load rules text on this device. `authored`
 * marks words the app writes itself, which show to everyone.
 */
export function RuleText({
  text,
  rules = noRules,
  className,
  authored = false,
  cite = false,
}: {
  text: string
  rules?: KeywordRule[]
  className?: string
  authored?: boolean
  /** Also write out the core rules the text quotes by number. */
  cite?: boolean
}) {
  const choice = useTextSourceChoice()
  if (hasTextTokens(text)) return <SourcedRuleText text={text} rules={rules} className={className} cite={cite} />
  // BSData's words reach this device to compute from, and show only where the reader chose to load BSData text.
  if (!authored && !choice.sources.has('bsdata'))
    return <SourceTextPrompt missing="unchosen" source="bsdata" className={cn('mt-2', className)} />
  return <RuleTextBody text={text} rules={rules} className={className} cite={cite} />
}

/** Published text names its source rather than stating it, so it is read from that source before it is drawn. */
function SourcedRuleText({ text, rules, className, cite }: { text: string; rules: KeywordRule[]; className?: string; cite: boolean }) {
  const source = useSourceText(text)
  // Labels with nothing loaded beneath them say nothing, so a card waiting on its text shows only why.
  if (source.missing && source.missing !== 'unavailable')
    return <SourceTextPrompt missing={source.missing} source={source.needs} className={cn('mt-2', className)} />
  return <RuleTextBody text={source.text} rules={rules} className={className} cite={cite} />
}

function RuleTextBody({ text, rules, className, cite }: { text: string; rules: KeywordRule[]; className?: string; cite: boolean }) {
  const segments = useMemo(() => ruleSegments(text), [text])
  return (
    <Rules value={rules}>
      <div className={cn('mt-2 space-y-2 font-rules text-sm text-dim', className)}>
        {segments.map((segment, at) => {
          const key = `${segment.kind}-${at}`
          if (segment.kind === 'table') return <RuleMarkup key={key} markup={segment.text} links={noLinks} authored />
          return (
            <Markdown key={key} components={components}>
              {segment.text}
            </Markdown>
          )
        })}
        {cite ? <CitedRules text={text} /> : null}
      </div>
    </Rules>
  )
}

function RuleReference({ children }: { children?: ReactNode }) {
  const rules = useContext(Rules)
  const name = typeof children === 'string' ? children : null
  return <strong className="font-semibold text-bone">{name ? <Keyword name={name} rules={rules} /> : children}</strong>
}
