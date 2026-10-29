import { LegalLinks, LegalPage, LegalSection } from './LegalPage'

export function PrivacyPolicy() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy policy" updated="29 October 2026">
      <LegalSection title="Scope">
        <p>
          Praetorium builds Warhammer 40,000 army lists and tracks battles between the players seated at them. This policy covers the
          service at praetorium.gg.
        </p>
        <p>
          An account is required to save rosters to the service or play battles. A roster you try without an account stays in browser
          storage on that device, shared by its tabs and surviving reloads. You can save it to your account or discard it.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <h3 className="text-sm tracking-label text-bone">Account data</h3>
        <p>
          Your display name, email address, optional profile image, and sign-in credentials. You can sign in with a password or with Apple,
          Google, Discord or GitHub; when you do, those providers share your name, email address and available profile image with us.
          Passwords are stored only as hashes. If you enable two-factor sign-in we store its secret and recovery codes.
        </p>
        <h3 className="text-sm tracking-label text-bone">Your content</h3>
        <p>
          Saved rosters — their name, tags, detachment and unit picks — battle records, including the players, armies, setup choices, scores
          and actions recorded during a game, friendships, the friends you lend a roster to, datasheets in your collection with their owned,
          built and painted model counts and photos, your wishlist, favourites, the combat simulator matchups you last ran, practice
          opponents you seat, the names you give guest opponents, the finished public BattleBase games you import, with their armies and
          your opponents' BattleBase names, and the BattleBase account you link. A linked account puts you in your seat in any game imported
          with you in it, whoever imports it. An imported game is a battle like any other: public, and in records and standings.
        </p>
        <h3 className="text-sm tracking-label text-bone">Technical data</h3>
        <p>
          Sessions record your IP address and browser user agent. Rate-limiting counters protect sign-in and other sensitive actions. A
          cookie remembers the order you sort your rosters in on that device. If you join a battle as a guest, a cookie holds the seat's
          secret on that device for up to 30 days; we keep only a hash of it.
        </p>
        <p>
          If you connect an MCP app, we store that app’s authorization, access grants and refresh tokens. You can revoke its access from
          your profile’s security settings.
        </p>
        <p>
          If you use a browser assistant, supported browsers can let it read game references and your saved rosters and battles through your
          signed-in session. You review and approve proposed changes on the page. Information returned to the assistant may be processed by
          its provider under that provider's privacy policy.
        </p>
        <p>
          If you allow notifications in the mobile app, we store that device's push token, its platform, and when it was last seen. Signing
          out or deleting your account removes it. You can turn notifications off in your device settings at any time.
        </p>
        <h3 className="text-sm tracking-label text-bone">Usage data</h3>
        <p>
          We measure how the product is used through PostHog: pages visited, buttons used, actions such as creating a roster, errors, and
          session replays. Measurements include counts, durations and outcomes — never list contents, search text or the details of actions
          recorded during a battle. Replays show how pages are used, but form inputs are masked and account, security and administration
          screens are not recorded. Only signed-in visitors get an identified profile, which carries their account name and email address so
          we can see who ran into a problem and reach them about it.
        </p>
        <p>
          Feedback you send, and our replies to it, are stored in PostHog with any email address you add, and the page and replay of the
          visit you sent it from. The conversation belongs to the browser you sent it from or, when you are signed in, to your account. A
          screenshot you attach is stored privately and only administrators can open it. When a list fails to import, its text is sent to us
          in an automatic report so we can fix the importer.
        </p>
      </LegalSection>

      <LegalSection title="How we use it">
        <LegalLinks>
          <li>To run accounts: authentication, optional two-factor sign-in, password reset.</li>
          <li>To deliver the product: showing your rosters, running battles, seating players, and sending the notifications you allow.</li>
          <li>To keep the service safe: rate limiting, abuse prevention, account administration.</li>
          <li>To improve it: seeing which features are used and fixing what breaks.</li>
        </LegalLinks>
      </LegalSection>

      <LegalSection title="Who can see your content">
        <LegalLinks>
          <li>Players seated in a battle see that battle's record, including its frozen copies of the armies played.</li>
          <li>
            Saved rosters start public unless you choose another default or access level. An unlisted roster can be read by anyone holding
            its link; a public roster is also listed on your profile and in public rosters, where any player can duplicate it into their own
            rosters. Private access requires ownership or a seat in the named battle where the roster was attached.
          </li>
          <li>Your name, profile picture and profile page are public.</li>
          <li>
            Your collection's datasheets, model counts, photos and wishlist are shown on your profile, and its photos on their datasheet
            pages. A photo another player reports is hidden from everyone but you until an administrator reviews it.
          </li>
          <li>
            Battles are public: anyone can watch past and live battles, including tournament battles. Spectators cannot change a battle or
            see a face-down Secret Mission.
          </li>
          <li>Battles may appear on the home page and in your profile's battle record.</li>
          <li>
            The leaderboard counts finished games from the last 90 days. Games with a practice opponent, or with a guest who has not claimed
            the game with an account, do not count.
          </li>
          <li>
            Sealing a tournament roster makes a separate frozen copy. Before reveal, only its assigned allies who are accepted entrants can
            read it; organizer status grants no extra access. Reveal makes accepted sealed rosters readable to anyone who can open that
            tournament.
          </li>
        </LegalLinks>
        <p>
          Returning a saved roster to private revokes its shared link. It does not revoke copies already frozen in a battle or revealed
          tournament. We do not maintain a separate anonymous statistical archive of private games. Copies someone has already downloaded or
          captured cannot be recalled.
        </p>
      </LegalSection>

      <LegalSection title="Third parties">
        <p>We do not sell personal data or use it for advertising. Data leaves the service only to:</p>
        <LegalLinks>
          <li>Our hosting provider, to run the service.</li>
          <li>PostHog, for the usage measurement described above.</li>
          <li>An email delivery provider, to send account email.</li>
          <li>Apple, Google, Discord or GitHub, when you use one of them to sign in.</li>
          <li>BattleBase, which receives the BattleBase username you enter when you import your games from it.</li>
          <li>
            TypeSafe, which checks each collection photo and profile picture you upload for content that does not belong on the service.
          </li>
          <li>
            Expo, with Apple or Google, to deliver the notifications you allow. A notification carries its title, text, and the page it
            opens.
          </li>
        </LegalLinks>
      </LegalSection>

      <LegalSection title="Email">
        <p>We send account and security email only: address verification and password resets. There is no marketing email.</p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          Deleting a saved roster removes the saved list, but keeps the frozen copies already used in battles or sealed in tournaments. Only
          a battle's creator can delete it; deletion removes its record and its contribution to public rankings. Deleting a tournament
          removes its entries and sealed rosters, while battles already played keep their own copies. Deleting a club removes its
          memberships and table; its battles stay. A club's table shows the results of battles its members chose the club for, to anyone for
          a public club and to members for a private one.
        </p>
        <p>
          You can permanently delete your account from your profile. This removes your profile, rosters, friendships, tournament entries,
          tournaments you organize, club memberships, clubs you own and every battle you played, including shared battles. Session records
          expire on their own; usage data is kept by our analytics provider under its retention settings. The{' '}
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
