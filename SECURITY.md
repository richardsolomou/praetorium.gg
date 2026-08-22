# Security Policy

## Reporting a vulnerability

Do not open a public issue for an unpatched vulnerability.

Use GitHub private vulnerability reporting. If it is unavailable, request a private contact method in a public issue. Do not include vulnerability details.

Include the affected version or commit. Include reproduction steps, impact, and known workarounds.

## Supported versions

Security fixes target the current `main` branch and [praetorium.gg](https://praetorium.gg).

## What is worth reporting

Praetorium stores accounts, army lists, and battle history. Report any way to:

- Act as another player.
- Read a battle without a seat or invitation.
- Take a seat without permission.
- Submit a command that the domain rules reject.
- Bypass mutation origin checks, session handling, redirect validation, or event-stream authorization.

Preview deployments run unmerged code and are replaced often. State which preview and commit you tested.
