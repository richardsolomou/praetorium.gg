Your AI assistant, such as ChatGPT or Claude, needs to sign in to work with your rosters, collection, battles, groups, leagues and tournaments. Public lookups and the simulator work without an account.

## Connect your account

The first time the assistant needs your account, it opens a Praetorium page in your browser.

1. If you're signed out, choose **Sign in to continue** and sign in. You'll come back to the request.
2. The **Connect to Praetorium** page names the app and shows the access it requests. Read, change and management access can be requested separately.
3. Choose **Allow access** to connect, or **Cancel** to refuse.

The assistant decides which access it asks for. If it asks for more than you want, cancel and check your assistant's connector settings.

## What each level of access allows

Read access lets the assistant:

- list your saved rosters and read one of them as you'd see it in the builder: each unit's name, points, wargear, enhancements, Warlord and attachments, the total, any problems that stop it being fielded, and any restrictions Praetorium couldn't check
- list your battles, 25 at a time, narrowed the way the battles page narrows them, such as by result, army, opponent, mission pack or date, and read the current state of one you're seated in
- read your record as your profile shows it, such as win rates by detachment and mission pack, and your leaderboard places
- read a battle invite, find a draft to resume, read a finished battle's report, and see who you can start a battle with
- read the models in your collection and wishlist, and see your saved folders and unit loadouts
- list your [feedback conversations](/support) and their replies, so it can check whether you've already reported something
- read your groups, leagues, tournaments and hidden-list games: what's due, your table and opponent, standings and results. The same rules as the site decide which sealed lists you can open. It can also see who holds a loan of your roster and which lists friends lent you.

Change access also lets it:

- create a roster or edit one you own, including its battle size (1,000, 2,000 or 3,000 points, or 600 for King of the Colosseum) and an optional custom points budget between 500 and 10,000
- change a roster's visibility to private, unlisted or public, copy a roster, archive one, or delete one you own
- create a battle with named player seats, set it up, record actions in it, or delete a battle you created
- join a group, league, tournament or hidden-list game, seal a list for it, check in, start the battle for your table, report your table's score, and start a league fixture with its sealed rosters
- send feedback to the Praetorium team as you, such as a rule the simulator doesn't calculate yet. It starts a conversation on your [Support](/support) page, marked as sent by an assistant, and the team's replies arrive there. It can send three a minute at most

Management access also lets it:

- join the chosen side of a battle invite, create or retire an invite link, send a friend an in-app invite, or manage players in a battle draft you created
- update owned, built, painted and wanted models and which datasheets your models can be fielded as, or import your collection in bulk
- lock or unlock a roster, separate a variant, lend a list to a friend, or end a roster loan. It can also apply a bulk roster change, organize folders, and save, rename or delete a unit loadout
- create and manage groups, review membership requests, draw and publish leagues, set deadlines and chess clocks, and report an agreed league result if you organize the group
- create tournaments and hidden-list games, manage entrants and teams, unseal or reveal lists where you have permission, pair rounds, check players in, drop no-shows, swap seats, assign battlefields, and report or reopen scores as the organizer
- choose your side in a hidden-list game, withdraw from a tournament or league, and submit your team's picks in team Swiss
- link a BattleBase account by verifying its tagline and import finished public battles from it in batches

An existing connection with change access asks you to grant management access before using those actions.

Changes go through the same checks as the site. A battle with nobody named starts as a draft, with a link your opponent joins through. A named opponent must be a friend, and a battle has four players at most. The assistant can also start a duel you play alone, choosing both armies from your lists. A battle action is only recorded if nobody has added anything to the log since the assistant last read it, so it can't overwrite a move your opponent just made.

## Revoke access

Open your [profile](/profile) and find **Connected apps**. Each app shows what it can do, such as **Read rosters, battles and events**, **Change rosters, battles and events**, or **Manage rosters, collection, invites, events and BattleBase**.

Choose **Revoke access** next to an app to disconnect it straight away. It loses access to your account, though public lookups still work. Connecting again later asks for permission again.

![Connected apps on the profile, listing Claude with read and change access and a Revoke access button.](screenshot:assistant-connected-apps 'Connected apps, under your profile')

## Other ways in

Assistants and crawlers can also read the same reference over a read-only web API, described at `/api/reference/v1/openapi.json`, and `/llms.txt` lists these interfaces. You don't need either to connect an assistant.
