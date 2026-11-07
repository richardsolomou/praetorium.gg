Connect Praetorium to Claude, ChatGPT, Gemini or another AI assistant and you can ask it about units, points, detachments and missions, plan a list, and run the combat simulator. It uses the same data as the site and links back to the page it read. You don't need an account for any of that. With your permission, it can also read and change your saved rosters and battles.

## Turn it on in your assistant

### Claude

Open [Praetorium in Claude's connector directory](https://claude.ai/directory/praetorium) and connect it. Claude asks you to sign in only when it needs your rosters or battles.

### ChatGPT

Open [Praetorium in ChatGPT's plugin directory](https://chatgpt.com/plugins/plugin_asdk_app_6adb29330cd08191b5833c45b0fffc79) and choose **Install plugin**.

### Gemini

1. In the Gemini web app, open **Settings**, then **Connected Apps**.
2. Under **Custom apps**, add `https://praetorium.gg/mcp`.

Praetorium then works in the Gemini mobile app too. Google only offers custom apps to people 18 or over in the US, signed in with a personal Google Account and with Keep Activity turned on.

### Other assistants

Look in the assistant's settings for connectors, apps, integrations or MCP servers. Add a custom or remote server with the address `https://praetorium.gg/mcp`. Some assistants only show this option in a developer or advanced mode, and some plans or workspaces don't offer it at all.

## Ask your first question

Check that your assistant lists Praetorium's tools, and turn the connector on for this chat if your assistant asks. Then name Praetorium in your first prompt, so it doesn't answer from memory:

> Using Praetorium, how many points is a five-model Immortals unit for Necrons?

The answer should come with a link to the Immortals datasheet. Open it before you rely on the number, especially for anything you'll take to a game or a tournament.

## Using your rosters and battles

The first time the assistant needs your rosters or battles, it opens this page on Praetorium so you can choose what it may do. [Let an assistant use your account](/docs/assistant-account) explains each permission and how to revoke them.

![The Connect to Praetorium page, where Claude asks to read and edit rosters and battles, with Allow access and Cancel.](screenshot:assistant-consent 'Connect to Praetorium, the first time an assistant needs your account')

## Why answers link instead of quoting rules

Praetorium gives assistants names, numbers, points and calculated results, never rules text. When wording is left out, assistants are told to fetch it from the published source instead of guessing. If the data doesn't answer a question, the tools say so.

So when an answer depends on how a rule is worded, follow the link and read it yourself. Links go to the matching page under [Factions](/factions), [Missions](/missions) or [Rules](/rules), which show the same numbers the assistant received. [Data updates](/data-updates) lists when the data last changed.

## Connection details

Praetorium is a remote MCP server at `https://praetorium.gg/mcp`, using Streamable HTTP. You don't need an API key. If you're asked for a transport, choose HTTP or Streamable HTTP, not SSE or a local command.

If you use Claude Code in a terminal, one command adds it:

```text
claude mcp add --transport http praetorium https://praetorium.gg/mcp
```
