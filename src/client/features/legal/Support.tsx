import { Link } from '@tanstack/react-router'
import { MessageSquareWarning } from 'lucide-react'
import { useState } from 'react'
import { version } from '../../../../package.json'
import { Button } from '@/components/ui/button'
import { openFeedback } from '../feedback/FeedbackDialog'
import { DocsSearchField, DocsSearchResults, TroubleshootingLinks } from '../docs/DocsSearch'
import { DISCORD } from '../../projectLinks'
import { LegalPage, LegalSection } from './LegalPage'

export function Support() {
  const [query, setQuery] = useState('')
  return (
    <LegalPage eyebrow="Help" title="Support" updated="23 October 2026">
      <LegalSection title="Find an answer">
        <p>Search the docs for a task or the message you’re seeing, or open the list of fixes for the part of Praetorium you’re using.</p>
        <DocsSearchField value={query} onChange={setQuery} className="max-w-none" />
        {query.trim() ? <DocsSearchResults query={query} /> : <TroubleshootingLinks />}
        <p>
          <Link to="/docs" className="text-info hover:text-parchment">
            Browse all docs
          </Link>
        </p>
      </LegalSection>

      <LegalSection title="Contact us">
        <p>
          Send feedback from any page, through the account menu or the More tab. It opens over the page you are on and sends us that page,
          your device and this version of Praetorium with your message, and you can attach a screenshot.
        </p>
        <Button onClick={openFeedback}>
          <MessageSquareWarning /> Send feedback
        </Button>
        <p>
          For community help and feature ideas, join the{' '}
          <a href={DISCORD} target="_blank" rel="noreferrer noopener" className="text-info hover:text-parchment">
            Praetorium Discord
          </a>
          .
        </p>
        <p>
          To report a problem in public instead, use the{' '}
          <a href="https://github.com/richardsolomou/praetorium.gg/issues/new" className="text-info hover:text-parchment">
            public issue tracker
          </a>
          . Include what you expected, what happened, the page address, your device model, operating-system version, and Praetorium version.
          Do not include a password, two-factor secret, recovery code, or private roster link.
        </p>
        <p>
          This page is running Praetorium <span className="readout">{version}</span>.
        </p>
      </LegalSection>

      <LegalSection title="Privacy and your account">
        <p>
          For a private account, privacy, or deletion request, email{' '}
          <a href="mailto:privacy@praetorium.gg" className="text-info hover:text-parchment">
            privacy@praetorium.gg
          </a>
          . To delete your account yourself, follow{' '}
          <Link to="/delete-account" className="text-info hover:text-parchment">
            Delete account
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
