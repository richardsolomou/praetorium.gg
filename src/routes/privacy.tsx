import { createFileRoute } from '@tanstack/react-router'
import { LegalLinks, LegalPage, LegalSection } from '../client/components/LegalPage'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy policy — Praetorium' },
      { name: 'description', content: 'What Praetorium collects, who can see your lists and battles, and how to have it deleted.' },
    ],
  }),
  component: PrivacyPolicy,
})

function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy policy" updated="1 September 2026">
      <LegalSection title="Scope">
        <p>
          Praetorium builds Warhammer 40,000 army lists and tracks battles between the players seated at them. This policy covers the hosted
          service at praetorium.gg. It does not cover self-hosted installations, whose data is controlled by whoever operates them.
        </p>
        <p>An account is required to keep rosters or play battles, so everything below is about signed-in use.</p>
      </LegalSection>

      <LegalSection title="What we collect">
        <h3 className="text-[0.8125rem] tracking-[0.04em] text-bone">Account data</h3>
        <p>
          Your display name, email address, optional profile image, and sign-in credentials. You can sign in with a password or with Apple,
          Google or Discord; when you do, those providers share your name, email address and available profile image with us. Passwords are
          stored only as hashes. If you enable two-factor sign-in we store its secret and recovery codes.
        </p>
        <h3 className="text-[0.8125rem] tracking-[0.04em] text-bone">Your content</h3>
        <p>
          Saved rosters — their name, tags, detachment and unit picks — battle records, including the players, armies, setup choices, scores
          and actions recorded during a game, friendships, datasheets you mark as owned, favourites, and practice opponents you seat.
        </p>
        <h3 className="text-[0.8125rem] tracking-[0.04em] text-bone">Technical data</h3>
        <p>Sessions record your IP address and browser user agent. Rate-limiting counters protect sign-in and other sensitive actions.</p>
        <h3 className="text-[0.8125rem] tracking-[0.04em] text-bone">Usage data</h3>
        <p>
          We measure how the product is used through PostHog: pages visited, buttons used, actions such as creating a roster, errors, and
          session replays. Measurements include counts, durations and outcomes — never names, email addresses, list contents, search text or
          the details of actions recorded during a battle. Replays show how pages are used, but form inputs are masked. Only signed-in
          visitors get an identified profile.
        </p>
      </LegalSection>

      <LegalSection title="How we use it">
        <LegalLinks>
          <li>To run accounts: authentication, optional two-factor sign-in, password reset.</li>
          <li>To deliver the product: showing your rosters, running battles, seating players.</li>
          <li>To keep the service safe: rate limiting, abuse prevention, account administration.</li>
          <li>To improve it: seeing which features are used and fixing what breaks.</li>
        </LegalLinks>
      </LegalSection>

      <LegalSection title="Who can see your content">
        <LegalLinks>
          <li>Players seated in a battle see that battle's record, including every attached roster.</li>
          <li>A roster is unlisted by default: anyone with its link can read it. Make one private and only you can open it.</li>
          <li>Your name, profile picture and profile page are public.</li>
          <li>
            You choose whether anyone, friends, or only the seated players can watch your battles. The most private choice made by anyone at
            the table applies to the whole battle.
          </li>
          <li>Public battles may appear on the home page, whether they are live or finished.</li>
        </LegalLinks>
        <p>There is no player directory, chat, social feed, or matchmaking.</p>
      </LegalSection>

      <LegalSection title="Third parties">
        <p>We do not sell personal data or use it for advertising. Data leaves the service only to:</p>
        <LegalLinks>
          <li>Our hosting provider, to run the service.</li>
          <li>PostHog, for the usage measurement described above.</li>
          <li>An email delivery provider, to send account email.</li>
          <li>Apple, Google or Discord, when you use one of them to sign in.</li>
        </LegalLinks>
      </LegalSection>

      <LegalSection title="Email">
        <p>We send account and security email only: address verification and password resets. There is no marketing email.</p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          Your content is kept while your account exists. Deleting a saved roster or battle removes it. You can permanently delete your
          account from your profile. This removes your profile, rosters, friendships, league participation and every battle you played,
          including shared battles. Session records expire on their own; usage data is kept by our analytics provider under its retention
          settings. The{' '}
          <a href="/delete-account" className="text-info hover:text-parchment">
            account deletion page
          </a>{' '}
          gives the same path outside the installed application.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Praetorium is not directed at children. Accounts require you to be at least 13 years old, and we will delete any account we learn
          belongs to someone younger.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Traffic is encrypted in transit, passwords are stored as hashes, and administrative access is limited to operating the service. No
          transmission or storage is perfectly secure, so choose a strong password and keep your credentials private.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If this policy changes, the new version is posted on this page with an updated date. The terms of service at{' '}
          <a href="/terms" className="text-info hover:text-parchment">
            /terms
          </a>{' '}
          govern use of the service itself.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions, and requests for access, correction or deletion:{' '}
          <a href="mailto:privacy@praetorium.gg" className="text-info hover:text-parchment">
            privacy@praetorium.gg
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
