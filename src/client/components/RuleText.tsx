import { createContext, type ReactNode, useContext, useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { RuleLinks } from '../ruleLinks'
import { Keyword, type KeywordRule } from './Keyword'
import { RuleMarkup } from './RuleMarkup'

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
  return text
    .replaceAll('^^', '')
    .replaceAll(/<\/?ins>/g, '')
    .replaceAll(/^[ \t\u00a0]+/gm, (indent) => indent.replaceAll('\u00a0', ' '))
    .replaceAll(/(?<!\*)\[([\p{L}\p{N} +'"’\p{Pd}]+)\](?!\*)/gu, '**[$1]**')
}

/** A table, and the prose either side of it. Markdown has no table this source's rows fit. */
const TABLE = /<table>[^]*?(?:<\/table>|$)/g

export type RuleSegment = { kind: 'markdown' | 'table'; text: string }

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

export function RuleText({ text, rules = noRules, className }: { text: string; rules?: KeywordRule[]; className?: string }) {
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
