import { createFileRoute } from '@tanstack/react-router'
import { LegalLinks, LegalPage, LegalSection } from '../client/components/LegalPage'

export const Route = createFileRoute('/support')({
  head: () => ({
    meta: [
      { title: 'Support — Praetorium' },
      { name: 'description', content: 'Get help with the Praetorium web, iOS, and Android applications.' },
    ],
  }),
  component: Support,
})

function Support() {
  return (
    <LegalPage title="Support" updated="31 August 2026">
      <LegalSection title="Get help">
        <p>
          Report a product problem in the{' '}
          <a href="https://github.com/richardsolomou/praetorium.gg/issues/new" className="text-info hover:text-parchment">
            public issue tracker
          </a>
          . Include what you expected, what happened, the page address, your device model, operating-system version, and Praetorium app
          version. Do not include a password, two-factor secret, recovery code, or private roster link.
        </p>
      </LegalSection>

      <LegalSection title="Account access">
        <LegalLinks>
          <li>Enter your email on the sign-in page before choosing Forgot password.</li>
          <li>Use the same Apple, Google, or Discord account that you originally linked.</li>
          <li>Check that the device date and time are correct before retrying a two-factor code.</li>
        </LegalLinks>
        <p>
          For a private account, privacy, or deletion request, email{' '}
          <a href="mailto:privacy@praetorium.gg" className="text-info hover:text-parchment">
            privacy@praetorium.gg
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Application connection">
        <LegalLinks>
          <li>Confirm that the device can open https://praetorium.gg in its browser.</li>
          <li>Return to the application and choose Try again after the connection is restored.</li>
          <li>Update to the latest store version before reporting a sign-in or application-link problem.</li>
        </LegalLinks>
      </LegalSection>
    </LegalPage>
  )
}
