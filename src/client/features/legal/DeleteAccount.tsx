import { Link } from '@tanstack/react-router'
import { LegalPage, LegalSection } from './LegalPage'

export function DeleteAccount() {
  return (
    <LegalPage eyebrow="Help" title="Delete account" updated="26 October 2026">
      <LegalSection title="Delete from Praetorium">
        <p>
          Sign in, choose Account settings from the account menu, and choose Delete account at the bottom of the page. The confirmation
          names everything that will be removed before the deletion runs.
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
          Deletion removes your profile, credentials, sessions, rosters, friendships, tournament entries, the clubs you own and every battle
          you played, including shared battles. The action cannot be undone.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
