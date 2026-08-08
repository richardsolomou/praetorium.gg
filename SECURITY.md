# Security Policy

## Reporting a vulnerability

Please do not open a public issue for an unpatched vulnerability.

Use GitHub's private vulnerability reporting. If it is unavailable, open an issue asking for a private way to get in touch, without details of the vulnerability itself.

In the private report, include the affected deployment or commit, steps to reproduce, the impact, and any workaround you know of.

## Supported versions

Fixes are made against the current `main` branch and the deployment at [praetorium.gg](https://praetorium.gg).

## What is worth reporting

Praetorium keeps accounts and the battles and lists attached to them. So the interesting questions are whether one player can act as another, read a battle they are not in or were never sent, take a seat they were not offered, or make an instance accept a command its own rules forbid. Mutation origin checks, session handling, the sign-in redirect and the event stream are all worth looking at.

Preview deployments (`pr-<number>.praetorium.gg`) are disposable instances of unmerged code. Findings there are welcome, but say so — they may already be fixed on `main`.
