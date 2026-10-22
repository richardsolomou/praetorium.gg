Praetorium runs an MCP server, so an AI assistant such as Claude or ChatGPT can look up units, points, detachments and missions from the same data the site uses, run the combat simulator, and link you back to the page it read. With your permission, it can also read and change your saved rosters and battles.

## Add the server

The server address is:

```text
https://praetorium.gg/mcp
```

It's a remote server using Streamable HTTP. You don't need an API key, and you don't need an account for reference lookups or the simulator.

Where you add it depends on the assistant. Look in its settings for connectors, apps, integrations or MCP servers, and add a custom or remote server with the address above. Some assistants only show this option in a developer or advanced mode, and some plans or workspaces don't offer it at all. If you're asked for a transport, choose HTTP or Streamable HTTP, not SSE or a local command.

If you use Claude Code in a terminal, one command adds it:

```text
claude mcp add --transport http praetorium https://praetorium.gg/mcp
```

Once it's added, check that the assistant lists Praetorium's tools, and turn the connector on for the chat you're using if your assistant asks you to enable connectors per conversation.

## Ask your first question

Name Praetorium in the prompt the first time so the assistant reaches for it rather than answering from memory:

> Using Praetorium, how many points is a five-model Immortals unit for Necrons?

The answer should come with a link to the Immortals datasheet. Open it before you rely on the number, especially for anything you'll take to a game or a tournament.

## Why answers link instead of quoting rules

Praetorium gives assistants names, numbers, points and calculated results, never rules text. When a record leaves wording out, it points to the published source file and entry that contains it, and assistants are told to fetch the wording from there rather than guess it. If the data doesn't answer a question, the tools say so instead of guessing.

So when an answer depends on how a rule is worded, follow the link and read it yourself. The links go to the matching page under [Factions](/factions), [Missions](/missions) or [Rules](/rules), which show the same numbers the assistant received. [Data updates](/data-updates) lists when the data last changed.
