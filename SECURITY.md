# Security Policy

## Reporting a vulnerability

Unpatched vulnerabilities are reported privately rather than through a public issue.

GitHub private vulnerability reporting is the primary channel. When it is unavailable, a public issue can request a private contact method without including vulnerability details.

A useful report includes the affected version or commit, reproduction steps, impact, and any known workarounds.

## Supported versions

Security fixes target the current `main` branch and [praetorium.gg](https://praetorium.gg).

## What is worth reporting

Praetorium stores accounts, army lists, and battle history. Relevant reports include any way to:

- Act as another player.
- Read a battle without a seat or invitation.
- Take a seat without permission.
- Submit a command that the domain rules reject.
- Bypass mutation origin checks, session handling, redirect validation, or event-stream authorization.

Preview deployments run unmerged code and are replaced often, so preview reports identify the tested preview and commit.
