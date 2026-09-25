# Routes

Map URLs and API requests to validated loaders and handlers.

## entrances

- route [.]well-known.apple-app-site-association.ts: Handles /.well-known/apple-app-site-association.
  handler: Route in [.]well-known.apple-app-site-association.ts
  trust: external-request
- route [.]well-known.assetlinks[.]json.ts: Handles /.well-known/assetlinks.json.
  handler: Route in [.]well-known.assetlinks[.]json.ts
  trust: external-request
- route root module: Handles the root page.
  handler: Route in __root.tsx
  trust: external-request
- route admin.tsx: Handles /admin.
  handler: Route in admin.tsx
  trust: external-request
- route api/apple-notifications.ts: Handles /api/apple-notifications.
  handler: Route in api/apple-notifications.ts
  trust: external-request
- route api/auth.$.ts: Handles /api/auth/$.
  handler: Route in api/auth.$.ts
  trust: external-request
- route api/faction-icons.$id.ts: Handles /api/faction-icons/$id.
  handler: Route in api/faction-icons.$id.ts
  trust: external-request
- route api/health.ts: Handles /api/health.
  handler: Route in api/health.ts
  trust: external-request
- route api/previews.battles.$token.ts: Handles /api/previews/battles/$token.
  handler: Route in api/previews.battles.$token.ts
  trust: external-request
- route api/previews.rosters.$id.ts: Handles /api/previews/rosters/$id.
  handler: Route in api/previews.rosters.$id.ts
  trust: external-request
- route api/previews.site.ts: Handles /api/previews/site.
  handler: Route in api/previews.site.ts
  trust: external-request
- route api/previews.users.$userId.ts: Handles /api/previews/users/$userId.
  handler: Route in api/previews.users.$userId.ts
  trust: external-request
- route api/realtime.token.ts: Handles /api/realtime/token.
  handler: Route in api/realtime.token.ts
  trust: external-request
- route api/reference/v1/about.ts: Handles /api/reference/v1/about.
  handler: Route in api/reference/v1/about.ts
  trust: external-request
- route api/reference/v1/datasheets.$catalogueId.$slug.ts: Handles /api/reference/v1/datasheets/$catalogueId/$slug.
  handler: Route in api/reference/v1/datasheets.$catalogueId.$slug.ts
  trust: external-request
- route api/reference/v1/detachments.$catalogueId.$slug.ts: Handles /api/reference/v1/detachments/$catalogueId/$slug.
  handler: Route in api/reference/v1/detachments.$catalogueId.$slug.ts
  trust: external-request
- route api/reference/v1/documents.$id.ts: Handles /api/reference/v1/documents/$id.
  handler: Route in api/reference/v1/documents.$id.ts
  trust: external-request
- route api/reference/v1/factions.$catalogueId.units.ts: Handles /api/reference/v1/factions/$catalogueId/units.
  handler: Route in api/reference/v1/factions.$catalogueId.units.ts
  trust: external-request
- route api/reference/v1/factions.ts: Handles /api/reference/v1/factions.
  handler: Route in api/reference/v1/factions.ts
  trust: external-request
- route api/reference/v1/index.ts: Handles /api/reference/v1/.
  handler: Route in api/reference/v1/index.ts
  trust: external-request
- route api/reference/v1/openapi[.]json.ts: Handles /api/reference/v1/openapi.json.
  handler: Route in api/reference/v1/openapi[.]json.ts
  trust: external-request
- route api/reference/v1/records.$id.ts: Handles /api/reference/v1/records/$id.
  handler: Route in api/reference/v1/records.$id.ts
  trust: external-request
- route api/reference/v1/rules.$documentId.$sectionId.ts: Handles /api/reference/v1/rules/$documentId/$sectionId.
  handler: Route in api/reference/v1/rules.$documentId.$sectionId.ts
  trust: external-request
- route api/reference/v1/search.ts: Handles /api/reference/v1/search.
  handler: Route in api/reference/v1/search.ts
  trust: external-request
- route battles.$token.tsx: Handles /battles/$token.
  handler: Route in battles.$token.tsx
  trust: external-request
- route battles.index.tsx: Handles /battles/.
  handler: Route in battles.index.tsx
  trust: external-request
- route battles.tsx: Handles /battles.
  handler: Route in battles.tsx
  trust: external-request
- route data-updates.index.tsx: Handles /data-updates/.
  handler: Route in data-updates.index.tsx
  trust: external-request
- route delete-account.tsx: Handles /delete-account.
  handler: Route in delete-account.tsx
  trust: external-request
- route factions.$catalogueId.$entryId.tsx: Handles /factions/$catalogueId/$entryId.
  handler: Route in factions.$catalogueId.$entryId.tsx
  trust: external-request
- route factions.$catalogueId.datasheets.$entryId.tsx: Handles /factions/$catalogueId/datasheets/$entryId.
  handler: Route in factions.$catalogueId.datasheets.$entryId.tsx
  trust: external-request
- route factions.$catalogueId.datasheets.tsx: Handles /factions/$catalogueId/datasheets.
  handler: Route in factions.$catalogueId.datasheets.tsx
  trust: external-request
- route factions.$catalogueId.detachments.$detachmentId.tsx: Handles /factions/$catalogueId/detachments/$detachmentId.
  handler: Route in factions.$catalogueId.detachments.$detachmentId.tsx
  trust: external-request
- route factions.$catalogueId.reference.datasheets.tsx: Handles /factions/$catalogueId/reference/datasheets.
  handler: Route in factions.$catalogueId.reference.datasheets.tsx
  trust: external-request
- route factions.$catalogueId.reference.detachments.$detachmentId.tsx: Handles /factions/$catalogueId/reference/detachments/$detachmentId.
  handler: Route in factions.$catalogueId.reference.detachments.$detachmentId.tsx
  trust: external-request
- route factions.$catalogueId.reference.tsx: Handles /factions/$catalogueId/reference.
  handler: Route in factions.$catalogueId.reference.tsx
  trust: external-request
- route factions.$catalogueId.tsx: Handles /factions/$catalogueId.
  handler: Route in factions.$catalogueId.tsx
  trust: external-request
- route factions.tsx: Handles /factions.
  handler: Route in factions.tsx
  trust: external-request
- route friends.tsx: Handles /friends.
  handler: Route in friends.tsx
  trust: external-request
- route index.tsx: Handles /.
  handler: Route in index.tsx
  trust: external-request
- route invite.$token.tsx: Handles /invite/$token.
  handler: Route in invite.$token.tsx
  trust: external-request
- route leaderboard.tsx: Handles /leaderboard.
  handler: Route in leaderboard.tsx
  trust: external-request
- route leagues.$token.tsx: Handles /leagues/$token.
  handler: Route in leagues.$token.tsx
  trust: external-request
- route leagues.index.tsx: Handles /leagues/.
  handler: Route in leagues.index.tsx
  trust: external-request
- route leagues.tsx: Handles /leagues.
  handler: Route in leagues.tsx
  trust: external-request
- route llms[.]txt.ts: Handles /llms.txt.
  handler: Route in llms[.]txt.ts
  trust: external-request
- route mcp.ts: Handles /mcp.
  handler: Route in mcp.ts
  trust: external-request
- route mission-matchups.$packId.$you.$opponent.tsx: Handles /mission-matchups/$packId/$you/$opponent.
  handler: Route in mission-matchups.$packId.$you.$opponent.tsx
  trust: external-request
- route mission-packs.$packId.tsx: Handles /mission-packs/$packId.
  handler: Route in mission-packs.$packId.tsx
  trust: external-request
- route mission-packs.$packId_.secondary-missions.$cardId.tsx: Handles /mission-packs/$packId_/secondary-missions/$cardId.
  handler: Route in mission-packs.$packId_.secondary-missions.$cardId.tsx
  trust: external-request
- route mission-packs.tsx: Handles /mission-packs.
  handler: Route in mission-packs.tsx
  trust: external-request
- route more.tsx: Handles /more.
  handler: Route in more.tsx
  trust: external-request
- route native-auth.tsx: Handles /native-auth.
  handler: Route in native-auth.tsx
  trust: external-request
- route privacy.tsx: Handles /privacy.
  handler: Route in privacy.tsx
  trust: external-request
- route profile.tsx: Handles /profile.
  handler: Route in profile.tsx
  trust: external-request
- route reset-password.tsx: Handles /reset-password.
  handler: Route in reset-password.tsx
  trust: external-request
- route robots[.]txt.ts: Handles /robots.txt.
  handler: Route in robots[.]txt.ts
  trust: external-request
- route rosters.$id.edit.tsx: Handles /rosters/$id/edit.
  handler: Route in rosters.$id.edit.tsx
  trust: external-request
- route rosters.$id.index.tsx: Handles /rosters/$id/.
  handler: Route in rosters.$id.index.tsx
  trust: external-request
- route rosters.index.tsx: Handles /rosters/.
  handler: Route in rosters.index.tsx
  trust: external-request
- route rosters.new.tsx: Handles /rosters/new.
  handler: Route in rosters.new.tsx
  trust: external-request
- route rosters.tsx: Handles /rosters.
  handler: Route in rosters.tsx
  trust: external-request
- route rules.$documentId.$sectionId.tsx: Handles /rules/$documentId/$sectionId.
  handler: Route in rules.$documentId.$sectionId.tsx
  trust: external-request
- route rules.$documentId.tsx: Handles /rules/$documentId.
  handler: Route in rules.$documentId.tsx
  trust: external-request
- route rules.tsx: Handles /rules.
  handler: Route in rules.tsx
  trust: external-request
- route sign-in.tsx: Handles /sign-in.
  handler: Route in sign-in.tsx
  trust: external-request
- route signin.tsx: Handles /signin.
  handler: Route in signin.tsx
  trust: external-request
- route simulator.tsx: Handles /simulator.
  handler: Route in simulator.tsx
  trust: external-request
- route sitemap[.]xml.ts: Handles /sitemap.xml.
  handler: Route in sitemap[.]xml.ts
  trust: external-request
- route sources.tsx: Handles /sources.
  handler: Route in sources.tsx
  trust: external-request
- route support.tsx: Handles /support.
  handler: Route in support.tsx
  trust: external-request
- route terms.tsx: Handles /terms.
  handler: Route in terms.tsx
  trust: external-request
- route users.$userId.tsx: Handles /users/$userId.
  handler: Route in users.$userId.tsx
  trust: external-request

## invariants
