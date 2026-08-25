---
'praetorium.gg': patch
---

Fix profile picture upload on iOS. Safari cannot encode WebP, so the resize step returned an oversized PNG on every pass and always failed. The step now falls back to JPEG and shrinks the image edge, so an iOS user can set a profile picture.
