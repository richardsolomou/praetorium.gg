Your assistant only needs to sign in to work with your own rosters and battles. Everything else works without it.

## Connect your account

The first time the assistant needs your account, it opens a Praetorium page in your browser.

1. If you're signed out, choose **Sign in to continue** and sign in. You'll come back to the request.
2. The **Connect to Praetorium** page names the app and lists exactly what it's asking for, for example **Read your saved rosters, collection, battles and record, and the groups and tournaments you play in.** or **Edit your rosters, set up and record battles, and seal lists and report results in groups and tournaments.**
3. Choose **Allow access** to connect, or **Cancel** to refuse.

The assistant decides which access it asks for. If it asks for more than you want, cancel and check your assistant's connector settings.

## What each level of access allows

Read access lets the assistant:

- list your saved rosters and read one of them as you'd see it in the builder: each unit's name, points, wargear, enhancements, Warlord and attachments, the total, and any problems that stop it being fielded
- list your battles, 25 at a time, narrowed the way the battles page narrows them, such as by result, army, opponent, mission pack or date, and read the current state of one you're seated in
- read your record as your profile shows it, such as win rates by detachment and mission pack, and your leaderboard places
- read a finished battle's report, and see who you can start a battle with
- read the models in your collection
- read your groups, leagues, tournaments and hidden-list games: what's due, your table and opponent, standings and results. Nobody's sealed list is shown before the reveal.

Change access also lets it:

- create a roster or edit one you own, including its battle size (1,000, 2,000 or 3,000 points, or 600 for King of the Colosseum) and an optional custom points budget between 500 and 10,000
- change a roster's visibility to private, unlisted or public, copy a roster, archive one, or delete one you own
- create a battle with named player seats, set it up, record actions in it, or delete a battle you created
- join a group, league, tournament or hidden-list game, seal a list for it, check in, start the battle for your table, and report your table's score

It can't do anything only an organiser can, such as pairing rounds, letting players in or revealing lists, and it can't withdraw you from a tournament or league.

Changes go through the same checks as the site. A battle needs an opponent who is a friend, a practice opponent or a named guest, and seats four players at most. A battle action is only recorded if nobody has added anything to the log since the assistant last read it, so it can't overwrite a move your opponent just made.

## Revoke access

Open your [profile](/profile) and find **Connected apps**. Each app shows what it can do, such as **Read rosters, battles and events** or **Change rosters, battles and events**.

Choose **Revoke access** next to an app to disconnect it straight away. It loses access to your account, though public lookups still work. Connecting again later asks for permission again.

![Connected apps on the profile, listing Claude with read and change access and a Revoke access button.](screenshot:assistant-connected-apps 'Connected apps, under your profile')

## Other ways in

Assistants and crawlers can also read the same reference over a read-only web API, described at `/api/reference/v1/openapi.json`, and `/llms.txt` lists these interfaces. You don't need either to connect an assistant.
