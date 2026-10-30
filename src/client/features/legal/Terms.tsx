import { Link } from '@tanstack/react-router'
import { LegalLinks, LegalPage, LegalSection, PrivacyEmail } from './LegalPage'

export function Terms() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of service" updated="25 October 2026">
      <LegalSection title="The service">
        <p>
          Praetorium at praetorium.gg helps you build Warhammer 40,000 army lists and track games between the players seated at them. You
          can use the builder, simulator and public reference without an account. Sign in to save rosters to the service or start battles.
          These terms cover that service.
        </p>
        <p>By creating an account you agree to these terms. If you do not agree, do not use the service.</p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          You must be at least 13 years old. Give accurate information, keep your credentials private, and email <PrivacyEmail /> if you
          think an account has been compromised. You are responsible for activity under your account.
        </p>
        <p>We may suspend or close accounts that break these terms or endanger the service or its players.</p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <LegalLinks>
          <li>Use Praetorium lawfully, and play fair with the people you seat.</li>
          <li>Do not attack, overload, scrape at scale, or otherwise interfere with the service or other players' use of it.</li>
          <li>
            Do not try to reach content you are not entitled to — another player's private rosters, battles you are not seated in, or
            anyone's account.
          </li>
          <li>Do not misrepresent yourself as Praetorium, its operator, or Games Workshop.</li>
        </LegalLinks>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          Your lists stay yours. You grant us only the licence needed to store, price and display them to the people entitled to see them:
          you, the players seated opposite you, and anyone you share an unlisted or public list with. You are responsible for the names,
          tags and text you type. You can export any roster at any time. Deleting a saved roster removes the saved list, while frozen copies
          in battles and tournaments remain as described in the{' '}
          <Link to="/privacy" className="text-info hover:text-parchment">
            privacy policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Game data and trademarks">
        <p>
          Unit, points and rules data comes from the community projects listed on the{' '}
          <Link to="/sources" className="text-info hover:text-parchment">
            data sources page
          </Link>
          . Each source retains its rights in its work. Warhammer 40,000 and related marks belong to Games Workshop. Praetorium is
          unofficial and is not endorsed by or affiliated with Games Workshop; nothing here is an official product or rules reference.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          The service is provided as-is. Features may change, and the service may be interrupted or discontinued. Keep exports of anything
          you would hate to lose.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers and liability">
        <p>
          To the fullest extent permitted by law, Praetorium disclaims all warranties not stated in these terms and is not liable for
          indirect, incidental or consequential damages, including lost lists, missed games or lost profits. Nothing here limits liability
          that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="Ending">
        <p>
          Delete your account from your profile whenever you like, or email <PrivacyEmail /> for help. When an account ends, its data is
          handled as the{' '}
          <Link to="/privacy" className="text-info hover:text-parchment">
            privacy policy
          </Link>{' '}
          describes.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          Changes are posted on this page with an updated date. Continuing to use Praetorium after a change takes effect means you accept
          the revised terms.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
