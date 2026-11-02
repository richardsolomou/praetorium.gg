import type { ReactNode } from 'react'
import { PageContent, PageHeader } from '../../components/Page'
import { PRIVACY_EMAIL } from '../../projectLinks'

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="w-full">
      <PageHeader title={title} description={`Last updated ${updated}`} />
      <PageContent>
        {/* Narrower than the page, so a paragraph of legal prose keeps a readable measure. */}
        <div className="max-w-2xl pt-4 font-rules">{children}</div>
      </PageContent>
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-edge pt-6 first:mt-0 first:border-0 first:pt-0">
      <h2 className="text-xl">{title}</h2>
      <div className="mt-3 space-y-3.5 text-base leading-[1.65] text-bone/80">{children}</div>
    </section>
  )
}

export function LegalLinks({ children }: { children: ReactNode }) {
  return <ul className="list-[square] space-y-1.5 pl-5 marker:text-runner-hi">{children}</ul>
}

export function PrivacyEmail() {
  return (
    <a href={`mailto:${PRIVACY_EMAIL}`} className="text-bone underline underline-offset-4 hover:text-parchment">
      {PRIVACY_EMAIL}
    </a>
  )
}
