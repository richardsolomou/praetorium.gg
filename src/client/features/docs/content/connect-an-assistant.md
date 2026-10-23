Praetorium runs an MCP server, so an AI assistant such as Claude, ChatGPT or Gemini can look up units, points, detachments and missions from the same data the site uses, run the combat simulator, and link you back to the page it read. With your permission, it can also read and change your saved rosters and battles.

## Add the server

The server address is:

```text
https://praetorium.gg/mcp
```

It's a remote server using Streamable HTTP. You don't need an API key, and you don't need an account for reference lookups or the simulator.

### Claude

Praetorium is listed in [Claude's connector directory](https://claude.ai/directory/praetorium). Open it and connect Praetorium; Claude asks you to sign in only when a roster or battle tool needs your account.

If you use Claude Code in a terminal, one command adds it:

```text
claude mcp add --transport http praetorium https://praetorium.gg/mcp
```

### ChatGPT

Praetorium isn't in ChatGPT's plugin directory yet, so add it as a custom server. On chatgpt.com, open **Plugins**, choose **Add**, then **Add custom MCP server**. Enter the address above, set **Authentication** to **OAuth or no authentication**, accept the risk notice and choose **Create as a plugin**.

### Gemini

In the Gemini web app, open **Settings**, then **Connected Apps**, and add the address above under **Custom apps**. Google only offers custom apps to people 18 or over in the US, signed in with a personal Google Account and with Keep Activity turned on. Once added, Praetorium works in the Gemini mobile app too.

### Other assistants

Look in the assistant's settings for connectors, apps, integrations or MCP servers, and add a custom or remote server with the address above. Some assistants only show this option in a developer or advanced mode, and some plans or workspaces don't offer it at all. If you're asked for a transport, choose HTTP or Streamable HTTP, not SSE or a local command.

Once it's added, check that the assistant lists Praetorium's tools, and turn the connector on for the chat you're using if your assistant asks you to enable connectors per conversation.

The first time the assistant needs your rosters or battles, it opens this page on Praetorium so you can choose what it may do. [Let an assistant use your account](/docs/assistant-account) explains each permission and how to revoke them.

![The Connect to Praetorium page, where Claude asks to read and edit rosters and battles, with Allow access and Cancel.](screenshot:assistant-consent 'Connect to Praetorium, the first time an assistant needs your account')

## Ask your first question

Name Praetorium in the prompt the first time so the assistant reaches for it rather than answering from memory:

> Using Praetorium, how many points is a five-model Immortals unit for Necrons?

The answer should come with a link to the Immortals datasheet. Open it before you rely on the number, especially for anything you'll take to a game or a tournament.

## Why answers link instead of quoting rules

Praetorium gives assistants names, numbers, points and calculated results, never rules text. When a record leaves wording out, it points to the published source file and entry that contains it, and assistants are told to fetch the wording from there rather than guess it. If the data doesn't answer a question, the tools say so instead of guessing.

So when an answer depends on how a rule is worded, follow the link and read it yourself. The links go to the matching page under [Factions](/factions), [Missions](/missions) or [Rules](/rules), which show the same numbers the assistant received. [Data updates](/data-updates) lists when the data last changed.
