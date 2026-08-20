---
'praetorium': patch
---

Route PostHog analytics through `/t` instead of `/ingest`, since ad-blocker lists block that literal path segment regardless of host.
