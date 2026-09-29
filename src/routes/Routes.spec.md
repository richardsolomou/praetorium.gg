# Routes

Map URLs and API requests to validated loaders and handlers.

## entrances

- route [.]well-known.apple-app-site-association: Handles /.well-known/apple-app-site-association.
  handler: Route in [.]well-known.apple-app-site-association.ts
  trust: external-request
- route [.]well-known.assetlinks[.]json: Handles /.well-known/assetlinks.json.
  handler: Route in [.]well-known.assetlinks[.]json.ts
  trust: external-request
- route api/apple-notifications: Handles /api/apple-notifications.
  handler: Route in api/apple-notifications.ts
  trust: external-source
- route api/auth.$: Handles /api/auth/$.
  handler: Route in api/auth.$.ts
  trust: external-request
- route api/faction-icons.$id: Handles /api/faction-icons/$id.
  handler: Route in api/faction-icons.$id.ts
  trust: external-request
- route api/health: Handles /api/health.
  handler: Route in api/health.ts
  trust: external-request
- route api/previews.battles.$token: Handles /api/previews/battles/$token.
  handler: Route in api/previews.battles.$token.ts
  trust: external-request
- route api/previews.rosters.$id: Handles /api/previews/rosters/$id.
  handler: Route in api/previews.rosters.$id.ts
  trust: external-request
- route api/previews.site: Handles /api/previews/site.
  handler: Route in api/previews.site.ts
  trust: external-request
- route api/previews.users.$userId: Handles /api/previews/users/$userId.
  handler: Route in api/previews.users.$userId.ts
  trust: external-request
- route api/realtime.mode: Handles /api/realtime/mode.
  handler: Route in api/realtime.mode.ts
  trust: external-request
- route api/reference/v1/about: Handles /api/reference/v1/about.
  handler: Route in api/reference/v1/about.ts
  trust: external-request
- route api/reference/v1/datasheets.$catalogueId.$slug: Handles /api/reference/v1/datasheets/$catalogueId/$slug.
  handler: Route in api/reference/v1/datasheets.$catalogueId.$slug.ts
  trust: external-request
- route api/reference/v1/detachments.$catalogueId.$slug: Handles /api/reference/v1/detachments/$catalogueId/$slug.
  handler: Route in api/reference/v1/detachments.$catalogueId.$slug.ts
  trust: external-request
- route api/reference/v1/documents.$id: Handles /api/reference/v1/documents/$id.
  handler: Route in api/reference/v1/documents.$id.ts
  trust: external-request
- route api/reference/v1/factions.$catalogueId.units: Handles /api/reference/v1/factions/$catalogueId/units.
  handler: Route in api/reference/v1/factions.$catalogueId.units.ts
  trust: external-request
- route api/reference/v1/factions: Handles /api/reference/v1/factions.
  handler: Route in api/reference/v1/factions.ts
  trust: external-request
- route api/reference/v1/index: Handles /api/reference/v1/.
  handler: Route in api/reference/v1/index.ts
  trust: external-request
- route api/reference/v1/openapi[.]json: Handles /api/reference/v1/openapi.json.
  handler: Route in api/reference/v1/openapi[.]json.ts
  trust: external-request
- route api/reference/v1/records.$id: Handles /api/reference/v1/records/$id.
  handler: Route in api/reference/v1/records.$id.ts
  trust: external-request
- route api/reference/v1/rules.$documentId.$sectionId: Handles /api/reference/v1/rules/$documentId/$sectionId.
  handler: Route in api/reference/v1/rules.$documentId.$sectionId.ts
  trust: external-request
- route api/reference/v1/search: Handles /api/reference/v1/search.
  handler: Route in api/reference/v1/search.ts
  trust: external-request
- route api/spacetime.token: Handles /api/spacetime/token.
  handler: Route in api/spacetime.token.ts
  trust: external-request
- route llms[.]txt: Handles /llms.txt.
  handler: Route in llms[.]txt.ts
  trust: external-request
- route mcp: Handles /mcp.
  handler: Route in mcp.ts
  trust: external-request
- route robots[.]txt: Handles /robots.txt.
  handler: Route in robots[.]txt.ts
  trust: external-request
- route sitemap[.]xml: Handles /sitemap.xml.
  handler: Route in sitemap[.]xml.ts
  trust: external-request

- page root module: Handles the root route module.
  handler: Route in __root.tsx
  trust: external-request
- page admin: Handles /admin.
  handler: Route in admin.tsx
  trust: external-request
- page battles.$token: Handles /battles/$token.
  handler: Route in battles.$token.tsx
  trust: external-request
- page battles.index: Handles /battles/.
  handler: Route in battles.index.tsx
  trust: external-request
- page battles: Handles /battles.
  handler: Route in battles.tsx
  trust: external-request
- page data-updates.index: Handles /data-updates/.
  handler: Route in data-updates.index.tsx
  trust: external-request
- page delete-account: Handles /delete-account.
  handler: Route in delete-account.tsx
  trust: external-request
- page factions.$catalogueId.$entryId: Handles /factions/$catalogueId/$entryId.
  handler: Route in factions.$catalogueId.$entryId.tsx
  trust: external-request
- page factions.$catalogueId.datasheets.$entryId: Handles /factions/$catalogueId/datasheets/$entryId.
  handler: Route in factions.$catalogueId.datasheets.$entryId.tsx
  trust: external-request
- page factions.$catalogueId.datasheets: Handles /factions/$catalogueId/datasheets.
  handler: Route in factions.$catalogueId.datasheets.tsx
  trust: external-request
- page factions.$catalogueId.detachments.$detachmentId: Handles /factions/$catalogueId/detachments/$detachmentId.
  handler: Route in factions.$catalogueId.detachments.$detachmentId.tsx
  trust: external-request
- page factions.$catalogueId.reference.datasheets: Handles /factions/$catalogueId/reference/datasheets.
  handler: Route in factions.$catalogueId.reference.datasheets.tsx
  trust: external-request
- page factions.$catalogueId.reference.detachments.$detachmentId: Handles /factions/$catalogueId/reference/detachments/$detachmentId.
  handler: Route in factions.$catalogueId.reference.detachments.$detachmentId.tsx
  trust: external-request
- page factions.$catalogueId.reference: Handles /factions/$catalogueId/reference.
  handler: Route in factions.$catalogueId.reference.tsx
  trust: external-request
- page factions.$catalogueId: Handles /factions/$catalogueId.
  handler: Route in factions.$catalogueId.tsx
  trust: external-request
- page factions: Handles /factions.
  handler: Route in factions.tsx
  trust: external-request
- page friends: Handles /friends.
  handler: Route in friends.tsx
  trust: external-request
- page index: Handles /.
  handler: Route in index.tsx
  trust: external-request
- page invite.$token: Handles /invite/$token.
  handler: Route in invite.$token.tsx
  trust: external-request
- page leaderboard: Handles /leaderboard.
  handler: Route in leaderboard.tsx
  trust: external-request
- page leagues.$token: Handles /leagues/$token.
  handler: Route in leagues.$token.tsx
  trust: external-request
- page leagues.index: Handles /leagues/.
  handler: Route in leagues.index.tsx
  trust: external-request
- page leagues: Handles /leagues.
  handler: Route in leagues.tsx
  trust: external-request
- page mission-matchups.$packId.$you.$opponent: Handles /mission-matchups/$packId/$you/$opponent.
  handler: Route in mission-matchups.$packId.$you.$opponent.tsx
  trust: external-request
- page mission-packs.$packId: Handles /mission-packs/$packId.
  handler: Route in mission-packs.$packId.tsx
  trust: external-request
- page mission-packs.$packId_.secondary-missions.$cardId: Handles /mission-packs/$packId/secondary-missions/$cardId.
  handler: Route in mission-packs.$packId_.secondary-missions.$cardId.tsx
  trust: external-request
- page mission-packs: Handles /mission-packs.
  handler: Route in mission-packs.tsx
  trust: external-request
- page more: Handles /more.
  handler: Route in more.tsx
  trust: external-request
- page native-auth: Handles /native-auth.
  handler: Route in native-auth.tsx
  trust: external-request
- page privacy: Handles /privacy.
  handler: Route in privacy.tsx
  trust: external-request
- page profile: Handles /profile.
  handler: Route in profile.tsx
  trust: external-request
- page reset-password: Handles /reset-password.
  handler: Route in reset-password.tsx
  trust: external-request
- page rosters.$id.edit: Handles /rosters/$id/edit.
  handler: Route in rosters.$id.edit.tsx
  trust: external-request
- page rosters.$id.index: Handles /rosters/$id/.
  handler: Route in rosters.$id.index.tsx
  trust: external-request
- page rosters.index: Handles /rosters/.
  handler: Route in rosters.index.tsx
  trust: external-request
- page rosters.new: Handles /rosters/new.
  handler: Route in rosters.new.tsx
  trust: external-request
- page rosters: Handles /rosters.
  handler: Route in rosters.tsx
  trust: external-request
- page rules.$documentId.$sectionId: Handles /rules/$documentId/$sectionId.
  handler: Route in rules.$documentId.$sectionId.tsx
  trust: external-request
- page rules.$documentId: Handles /rules/$documentId.
  handler: Route in rules.$documentId.tsx
  trust: external-request
- page rules: Handles /rules.
  handler: Route in rules.tsx
  trust: external-request
- page sign-in: Handles /sign-in.
  handler: Route in sign-in.tsx
  trust: external-request
- page signin: Handles /signin.
  handler: Route in signin.tsx
  trust: external-request
- page simulator: Handles /simulator.
  handler: Route in simulator.tsx
  trust: external-request
- page sources: Handles /sources.
  handler: Route in sources.tsx
  trust: external-request
- page support: Handles /support.
  handler: Route in support.tsx
  trust: external-request
- page terms: Handles /terms.
  handler: Route in terms.tsx
  trust: external-request
- page users.$userId: Handles /users/$userId.
  handler: Route in users.$userId.tsx
  trust: external-request

## invariants
