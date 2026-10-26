import { Link } from '@tanstack/react-router'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { PRODUCT_DOCS } from '../../../contracts/productDocs'
import { SearchField } from '../../components/SearchField'
import { cn } from '@/lib/utils'
import { openFeedback } from '../feedback/support'
import { AREAS, docsMatching, proseLink, troubleshooting } from './docsLibrary'
import { countLabel } from '../../text'

export function FeedbackLink({ children }: { children: ReactNode }) {
  return (
    <button type="button" onClick={openFeedback} className={proseLink}>
      {children}
    </button>
  )
}

export function DocsSearchField({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <SearchField
      value={value}
      onChange={onChange}
      placeholder="Search docs and problems…"
      label="Search docs"
      clearLabel="Clear docs search"
      className={cn('max-w-md', className)}
    />
  )
}

/** Pages and Common problems symptoms matching `query`, each linking to where it is answered. */
export function DocsSearchResults({ query }: { query: string }) {
  const results = docsMatching(query)
  return (
    <section aria-label="Search results">
      <p className="rubric">{countLabel(results.length, 'result')}</p>
      {results.length ? (
        <ul className="mt-3 divide-y divide-edge border border-edge bg-panel">
          {results.map((entry) => {
            const Icon = entry.hash ? TriangleAlert : AREAS[entry.doc.section].icon
            return (
              <li key={entry.key}>
                <Link
                  to="/docs/$docId"
                  params={{ docId: entry.doc.slug }}
                  hash={entry.hash}
                  className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-raised"
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', entry.hash ? 'text-discarded' : 'text-info')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-bone group-hover:text-parchment">{entry.text}</span>
                    <span className="mt-0.5 block text-sm text-dim">{entry.detail}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-dim">
          Nothing matches “{query.trim()}”. Try fewer words, or <FeedbackLink>tell us what you were looking for</FeedbackLink>.
        </p>
      )}
    </section>
  )
}

/** Every area's list of fixes, for a reader who arrives with a problem rather than a task. */
export function TroubleshootingLinks() {
  return (
    <ul aria-label="Troubleshooting" className="grid border-t border-l border-edge sm:grid-cols-2">
      {PRODUCT_DOCS.filter(troubleshooting).map((doc) => {
        const Icon = AREAS[doc.section].icon
        return (
          <li key={doc.slug} className="border-r border-b border-edge bg-panel">
            <Link
              to="/docs/$docId"
              params={{ docId: doc.slug }}
              className="group flex h-full items-center gap-3 px-4 py-3 transition-colors hover:bg-raised"
            >
              <Icon className="size-4 shrink-0 text-info" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-bone group-hover:text-parchment">{doc.title}</span>
                <span className="mt-0.5 block text-sm text-dim">{doc.description}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint group-hover:text-parchment" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
