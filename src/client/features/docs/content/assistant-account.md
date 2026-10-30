## Let it use your account

Sign-in is optional and only needed for your own rosters and battles. There are two levels of access.

**Read** lets the assistant:

- list your saved rosters and read one of them as you'd see it in the builder: each unit's name, points, wargear, enhancements, Warlord and attachments, the total, and any problems that stop it being fielded
- list your battles, 25 at a time, and read the current state of one you're seated in

**Change** additionally lets it:

- create a roster or edit one you own, including its battle size (1,000, 2,000 or 3,000 points, or 600 for King of the Colosseum) and an optional custom points budget between 500 and 10,000
- change a roster's visibility to private, unlisted or public
- create a battle with named player seats
- record an action in a battle you're in

Account changes go through the same checks as the site. A battle needs an opponent who is a friend, a practice opponent or a named guest, and seats four players at most. A battle action is only recorded if nobody has added anything to the log since the assistant last read it, so it can't overwrite a move your opponent just made.

### Connect

The first time the assistant needs your account, it opens a Praetorium page in your browser. If you're signed out, choose **Sign in to continue**, sign in, and you'll come back to the request. The **Connect to Praetorium** page names the app and lists exactly what it's asking for, for example **Read your saved rosters and battles.** or **Edit your rosters, create battles, and record battle actions.** Choose **Allow access** to connect, or **Cancel** to refuse.

The assistant decides which access it asks for. If it asks for more than you want, cancel and check your assistant's connector settings.

### Revoke access

Open your [profile](/profile) and find **Connected apps**. Each app shows what it can do, such as **Read rosters and battles** or **Change rosters and record battles**. Choose **Revoke access** next to an app to disconnect it straight away; it loses access to your account, though public lookups still work. Connecting again later asks for permission again.

![Connected apps on the profile, listing Claude with read and change access and a Revoke access button.](screenshot:assistant-connected-apps 'Connected apps, under your profile')

## Other ways in

Assistants and crawlers can also read the same reference over a read-only web API, described at `/api/reference/v1/openapi.json`. The site's `/llms.txt` summarises what Praetorium does, lists these interfaces and links to these docs. You don't need either to use the MCP server.
