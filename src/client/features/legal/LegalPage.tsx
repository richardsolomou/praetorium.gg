import type { ReactNode } from 'react'
import { PageContent, PageHeader } from '../../components/Page'

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="w-full">
      <PageHeader eyebrow="Praetorium" title={title} description={`Last updated ${updated}`} />
      <PageContent className="pt-8">
        {/* Narrower than the page, so a paragraph of legal prose keeps a readable measure. */}
        <div className="max-w-2xl space-y-10 font-rules">{children}</div>
      </PageContent>
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-dim">{children}</div>
    </section>
  )
}

export function LegalLinks({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5 marker:text-edge-strong">{children}</ul>
}
