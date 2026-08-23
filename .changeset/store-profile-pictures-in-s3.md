---
'praetorium.gg': patch
---

Fix uploading a profile picture eventually causing HTTP 431 or 502 errors, by storing it in S3-compatible object storage instead of embedding it in the account and its session cookie.
