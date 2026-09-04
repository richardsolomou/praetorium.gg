import { Link } from '@tanstack/react-router'
import { type ReactNode, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { RuleLinks } from '../ruleLinks'
import { parseRuleMarkup, type RuleInline, type RuleMarkupBlock } from '../ruleMarkup'

/**
 * A rule as the rules documents write it.
 *
 * The source's own markup is read into blocks first, so nothing here is given to the
 * browser as markup. A number one rule quotes in another becomes a link when the
 * reader can reach that rule and stays the printed number when they cannot.
 */
export function RuleMarkup({ markup, links, className }: { markup: string; links: RuleLinks; className?: string }) {
  const blocks = useMemo(() => parseRuleMarkup(markup), [markup])
  return (
    <div className={cn('space-y-2 font-rules text-sm text-dim', className)}>
      <Blocks blocks={blocks} links={links} />
    </div>
  )
}

function Blocks({ blocks, links }: { blocks: RuleMarkupBlock[]; links: RuleLinks }) {
  return blocks.map((block, at) => {
    const key = `${block.kind}-${at}`
    if (block.kind === 'paragraph')
      return (
        <p key={key}>
          <Inlines content={block.content} links={links} />
        </p>
      )
    if (block.kind === 'list') {
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {block.items.map((item, index) => {
            const bullet = `${key}-item-${index}`
            return (
              <li key={bullet} className="space-y-1">
                <Blocks blocks={item} links={links} />
              </li>
            )
          })}
        </ul>
      )
    }
    return (
      <div key={key} className="overflow-x-auto">
        <table className="w-full min-w-md border border-edge text-left">
          <tbody>
            {block.rows.map((row, index) => {
              const line = `${key}-row-${index}`
              return (
                <tr key={line} className="border-b border-edge last:border-b-0">
                  {row.map((cell, column) => {
                    const field = `${line}-${column}`
                    return cell.header ? (
                      <th key={field} className="eyebrow border-r border-edge px-2 py-1.5 text-left last:border-r-0">
                        <Inlines content={cell.content} links={links} />
                      </th>
                    ) : (
                      <td key={field} className="border-r border-edge px-2 py-1.5 align-top last:border-r-0">
                        <Inlines content={cell.content} links={links} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  })
}

function Inlines({ content, links }: { content: RuleInline[]; links: RuleLinks }): ReactNode {
  return content.map((inline, at) => {
    const key = `${inline.kind}-${at}`
    switch (inline.kind) {
      case 'text':
        return inline.text
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-bone">
            <Inlines content={inline.children} links={links} />
          </strong>
        )
      case 'emphasis':
        // A slanted last letter leans into the next word, so italics end on a hair of
        // room. The space after them is in the text; this is what makes it legible.
        return (
          <em key={key} className="pe-[0.08em]">
            <Inlines content={inline.children} links={links} />
          </em>
        )
      case 'underline':
        return (
          <u key={key} className="underline decoration-edge-strong underline-offset-2">
            <Inlines content={inline.children} links={links} />
          </u>
        )
      case 'keyword':
        return (
          <span key={key} className="font-semibold text-azure">
            <Inlines content={inline.children} links={links} />
          </span>
        )
      case 'reference':
        return <QuotedRule key={key} code={inline.code} text={inline.text} links={links} />
    }
  })
}

function QuotedRule({ code, text, links }: { code: string; text: string; links: RuleLinks }) {
  const reference = links.get(code)
  if (!reference) return <span>{text}</span>
  return (
    <Link
      to="/rules/$documentId/$sectionId"
      params={{ documentId: reference.document, sectionId: reference.section }}
      hash={reference.anchor}
      title={reference.title}
      className="readout text-info hover:text-bone"
    >
      {text}
    </Link>
  )
}
