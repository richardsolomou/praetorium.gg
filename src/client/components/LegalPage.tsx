import type { ReactNode } from 'react'

/**
 * The shell both legal documents render inside: one narrow column of Barlow
 * prose under the compact display heading the rest of the interface uses.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <p className="eyebrow text-parchment">Praetorium</p>
      <h1 className="mt-1 text-3xl">{title}</h1>
      <p className="mt-2 font-rules text-xs text-faint">Last updated {updated}</p>
      <div className="mt-10 space-y-10 font-rules">{children}</div>
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
