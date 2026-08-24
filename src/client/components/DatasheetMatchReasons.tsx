import { Search } from 'lucide-react'
import { Fragment } from 'react'
import type { DatasheetSearchReason } from '../../server/datasheetSearch'

type Props = {
  query: string
  reasons: readonly DatasheetSearchReason[] | undefined
}

export function DatasheetMatchReasons({ query, reasons }: Props) {
  if (!reasons?.length) return null
  return (
    <span className="readout mt-0.5 flex min-w-0 items-start gap-1 text-[0.6875rem] leading-snug text-faint">
      <Search className="mt-0.5 size-3 shrink-0 text-parchment" aria-hidden />
      <span className="min-w-0">
        Matches{' '}
        {reasons.map((reason, index) => (
          <Fragment key={`${reason.kind}:${reason.value}`}>
            {index ? <span> · </span> : null}
            <span className="text-dim">
              <HighlightedValue query={query} value={reason.value} /> {reason.kind}
            </span>
          </Fragment>
        ))}
      </span>
    </span>
  )
}

function HighlightedValue({ query, value }: { query: string; value: string }) {
  const terms = [...new Set(query.match(/[\p{L}\p{N}]+/gu) ?? [])].toSorted((left, right) => right.length - left.length)
  if (!terms.length) return value
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'giu')
  const parts: { at: number; highlighted: boolean; text: string }[] = []
  let at = 0
  for (const match of value.matchAll(pattern)) {
    if (match.index > at) parts.push({ at, highlighted: false, text: value.slice(at, match.index) })
    parts.push({ at: match.index, highlighted: true, text: match[0] })
    at = match.index + match[0].length
  }
  if (!parts.length) return value
  if (at < value.length) parts.push({ at, highlighted: false, text: value.slice(at) })
  return parts.map((part) =>
    part.highlighted ? (
      <mark key={part.at} className="bg-transparent font-semibold text-bone">
        {part.text}
      </mark>
    ) : (
      <Fragment key={part.at}>{part.text}</Fragment>
    ),
  )
}

const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
