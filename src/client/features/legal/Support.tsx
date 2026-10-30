import { Link, useNavigate } from '@tanstack/react-router'
import { MessageSquareWarning } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageContent, PageHeader } from '../../components/Page'
import { openConversation, openFeedback } from '../feedback/support'
import { YourFeedback } from '../feedback/YourFeedback'
import { DocsSearchField, DocsSearchResults, TroubleshootingLinks } from '../docs/DocsSearch'
import { SupportAside } from './SupportAside'

/** `conversation`, which a reply email links to, opens over the page and leaves the address. */
export function Support({ conversation }: { conversation?: string }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    if (!conversation) return
    openConversation(conversation)
    void navigate({ to: '/support', search: {}, replace: true })
  }, [conversation, navigate])
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Help"
        title="Support"
        description="Find an answer in the docs, or send us feedback and follow our replies here."
        actions={
          <Button onClick={openFeedback}>
            <MessageSquareWarning /> Send feedback
          </Button>
        }
      />
      <PageContent>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-10">
            <YourFeedback />
            <section aria-labelledby="find-an-answer" className="space-y-3">
              <h2 id="find-an-answer" className="rubric border-b border-edge pb-2">
                Find an answer
              </h2>
              <p className="text-sm text-dim">
                Search the docs for a task or the message you’re seeing, or open the list of fixes for the part of Praetorium you’re using.
              </p>
              <DocsSearchField value={query} onChange={setQuery} className="max-w-none" />
              {query.trim() ? <DocsSearchResults query={query} /> : <TroubleshootingLinks />}
              <p className="text-sm">
                <Link to="/docs" className="text-info hover:text-parchment">
                  Browse all docs
                </Link>
              </p>
            </section>
          </div>

          <SupportAside />
        </div>
      </PageContent>
    </main>
  )
}
