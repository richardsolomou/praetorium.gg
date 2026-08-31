import { createFileRoute, Link } from '@tanstack/react-router'
import { LegalPage, LegalSection } from '../client/components/LegalPage'

export const Route = createFileRoute('/delete-account')({
  head: () => ({
    meta: [
      { title: 'Delete account — Praetorium' },
      { name: 'description', content: 'Permanently delete a Praetorium account and its associated data.' },
    ],
  }),
  component: DeleteAccount,
})

function DeleteAccount() {
  return (
    <LegalPage title="Delete account" updated="31 August 2026">
      <LegalSection title="Delete from Praetorium">
        <p>
          Sign in, open Profile, find Account security, and choose Permanently delete account. The confirmation names everything that will
          be removed before the deletion runs.
        </p>
        <p>
          <Link to="/sign-in" search={{ next: '/profile' }} className="text-info hover:text-parchment">
            Sign in to delete your account
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="If you cannot sign in">
        <p>
          Email{' '}
          <a href="mailto:privacy@praetorium.gg" className="text-info hover:text-parchment">
            privacy@praetorium.gg
          </a>{' '}
          from the account address and request permanent deletion. We will verify that the account belongs to you before deleting it.
        </p>
      </LegalSection>

      <LegalSection title="What deletion removes">
        <p>
          Deletion removes your profile, credentials, sessions, rosters, friendships, league participation, and every battle you
          participated in. A shared battle is removed in full because its append-only command log cannot remain valid without every
          participant. The action cannot be undone.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
