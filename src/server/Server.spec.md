# Server

Authenticate requests and coordinate catalogue, application, and persistence work.

## entrances

- reference MCP tool: Receives read-only reference tool calls over the MCP route.
  handler: handleReferenceMcp in referenceMcp.ts
  trust: external-request
- Apple account notification: Receives an Apple account event from the notification route.
  handler: appleNotificationResponse in appleAuth.ts
  trust: external-source
- rpc me: Receives the GET function request.
  handler: me in functions/accounts.ts
  trust: external-request
- rpc onboardingProgress: Receives the GET function request.
  handler: onboardingProgress in functions/accounts.ts
  trust: external-request
- rpc updateOnboardingProgress: Receives the POST function request.
  handler: updateOnboardingProgress in functions/accounts.ts
  trust: external-request
- rpc battleAudience: Receives the GET function request.
  handler: battleAudience in functions/accounts.ts
  trust: external-request
- rpc setBattleAudience: Receives the POST function request.
  handler: setBattleAudience in functions/accounts.ts
  trust: external-request
- rpc adminUsers: Receives the GET function request.
  handler: adminUsers in functions/accounts.ts
  trust: external-request
- rpc accountMethods: Receives the GET function request.
  handler: accountMethods in functions/accounts.ts
  trust: external-request
- rpc setOwnPassword: Receives the POST function request.
  handler: setOwnPassword in functions/accounts.ts
  trust: external-request
- rpc unlinkOwnAccount: Receives the POST function request.
  handler: unlinkOwnAccount in functions/accounts.ts
  trust: external-request
- rpc setAdminRole: Receives the POST function request.
  handler: setAdminRole in functions/accounts.ts
  trust: external-request
- rpc userProfile: Receives the GET function request.
  handler: userProfile in functions/accounts.ts
  trust: external-request
- rpc opponents: Receives the GET function request.
  handler: opponents in functions/accounts.ts
  trust: external-request
- rpc friendships: Receives the GET function request.
  handler: friendships in functions/accounts.ts
  trust: external-request
- rpc activeFriendInvite: Receives the GET function request.
  handler: activeFriendInvite in functions/accounts.ts
  trust: external-request
- rpc friendInvite: Receives the GET function request.
  handler: friendInvite in functions/accounts.ts
  trust: external-request
- rpc createFriendInvite: Receives the POST function request.
  handler: createFriendInvite in functions/accounts.ts
  trust: external-request
- rpc cancelFriendInvite: Receives the POST function request.
  handler: cancelFriendInvite in functions/accounts.ts
  trust: external-request
- rpc acceptFriendInvite: Receives the POST function request.
  handler: acceptFriendInvite in functions/accounts.ts
  trust: external-request
- rpc searchPlayers: Receives the GET function request.
  handler: searchPlayers in functions/accounts.ts
  trust: external-request
- rpc requestFriend: Receives the POST function request.
  handler: requestFriend in functions/accounts.ts
  trust: external-request
- rpc acceptFriend: Receives the POST function request.
  handler: acceptFriend in functions/accounts.ts
  trust: external-request
- rpc removeFriend: Receives the POST function request.
  handler: removeFriend in functions/accounts.ts
  trust: external-request
- rpc collection: Receives the GET function request.
  handler: collection in functions/accounts.ts
  trust: external-request
- rpc setOwned: Receives the POST function request.
  handler: setOwned in functions/accounts.ts
  trust: external-request
- rpc favouriteFactions: Receives the GET function request.
  handler: favouriteFactions in functions/accounts.ts
  trust: external-request
- rpc setFavouriteFaction: Receives the POST function request.
  handler: setFavouriteFaction in functions/accounts.ts
  trust: external-request
- rpc favouriteDetachments: Receives the GET function request.
  handler: favouriteDetachments in functions/accounts.ts
  trust: external-request
- rpc setFavouriteDetachment: Receives the POST function request.
  handler: setFavouriteDetachment in functions/accounts.ts
  trust: external-request
- rpc signInOptions: Receives the GET function request.
  handler: signInOptions in functions/accounts.ts
  trust: external-request
- rpc myBattles: Receives the GET function request.
  handler: myBattles in functions/battles.ts
  trust: external-request
- rpc publicBattles: Receives the GET function request.
  handler: publicBattles in functions/battles.ts
  trust: external-request
- rpc friendBattles: Receives the GET function request.
  handler: friendBattles in functions/battles.ts
  trust: external-request
- rpc standings: Receives the GET function request.
  handler: standings in functions/battles.ts
  trust: external-request
- rpc playerProfile: Receives the GET function request.
  handler: playerProfile in functions/battles.ts
  trust: external-request
- rpc playerRankings: Receives the GET function request.
  handler: playerRankings in functions/battles.ts
  trust: external-request
- rpc sharedBattles: Receives the GET function request.
  handler: sharedBattles in functions/battles.ts
  trust: external-request
- rpc openBattle: Receives the GET function request.
  handler: openBattle in functions/battles.ts
  trust: external-request
- rpc leagueBattleOptions: Receives the GET function request.
  handler: leagueBattleOptions in functions/battles.ts
  trust: external-request
- rpc createBattle: Receives the POST function request.
  handler: createBattle in functions/battles.ts
  trust: external-request
- rpc deleteBattle: Receives the POST function request.
  handler: deleteBattle in functions/battles.ts
  trust: external-request
- rpc submit: Receives the POST function request.
  handler: submit in functions/battles.ts
  trust: external-request
- rpc battleReport: Receives the GET function request.
  handler: battleReport in functions/battles.ts
  trust: external-request
- rpc catalogueChangeLog: Receives the GET function request.
  handler: catalogueChangeLog in functions/changes.ts
  trust: external-request
- rpc listLeagues: Receives the GET function request.
  handler: listLeagues in functions/leagues.ts
  trust: external-request
- rpc openLeague: Receives the GET function request.
  handler: openLeague in functions/leagues.ts
  trust: external-request
- rpc listLeagueBattles: Receives the GET function request.
  handler: listLeagueBattles in functions/leagues.ts
  trust: external-request
- rpc createLeague: Receives the POST function request.
  handler: createLeague in functions/leagues.ts
  trust: external-request
- rpc joinLeague: Receives the POST function request.
  handler: joinLeague in functions/leagues.ts
  trust: external-request
- rpc moderateLeagueEntry: Receives the POST function request.
  handler: moderateLeagueEntry in functions/leagues.ts
  trust: external-request
- rpc submitLeagueRoster: Receives the POST function request.
  handler: submitLeagueRoster in functions/leagues.ts
  trust: external-request
- rpc revealLeague: Receives the POST function request.
  handler: revealLeague in functions/leagues.ts
  trust: external-request
- rpc openLeagueRoster: Receives the GET function request.
  handler: openLeagueRoster in functions/leagues.ts
  trust: external-request
- rpc unsealLeagueRoster: Receives the POST function request.
  handler: unsealLeagueRoster in functions/leagues.ts
  trust: external-request
- rpc createLeagueEvent: Receives the POST function request.
  handler: createLeagueEvent in functions/leagues.ts
  trust: external-request
- rpc updateLeagueEvent: Receives the POST function request.
  handler: updateLeagueEvent in functions/leagues.ts
  trust: external-request
- rpc assignLeagueRosterRequirement: Receives the POST function request.
  handler: assignLeagueRosterRequirement in functions/leagues.ts
  trust: external-request
- rpc assignLeagueTeam: Receives the POST function request.
  handler: assignLeagueTeam in functions/leagues.ts
  trust: external-request
- rpc makeLeagueRecurring: Receives the POST function request.
  handler: makeLeagueRecurring in functions/leagues.ts
  trust: external-request
- rpc updateLeague: Receives the POST function request.
  handler: updateLeague in functions/leagues.ts
  trust: external-request
- rpc deleteLeague: Receives the POST function request.
  handler: deleteLeague in functions/leagues.ts
  trust: external-request
- rpc createLeagueBattle: Receives the POST function request.
  handler: createLeagueBattle in functions/leagues.ts
  trust: external-request
- rpc notificationSettings: Receives the GET function request.
  handler: notificationSettings in functions/notifications.ts
  trust: external-request
- rpc setPushNotifications: Receives the POST function request.
  handler: setPushNotifications in functions/notifications.ts
  trust: external-request
- rpc registerPushDevice: Receives the POST function request.
  handler: registerPushDevice in functions/notifications.ts
  trust: external-request
- rpc unregisterPushDevice: Receives the POST function request.
  handler: unregisterPushDevice in functions/notifications.ts
  trust: external-request
- rpc catalogueStatus: Receives the GET function request.
  handler: catalogueStatus in functions/references.ts
  trust: external-request
- rpc factionIndex: Receives the GET function request.
  handler: factionIndex in functions/references.ts
  trust: external-request
- rpc faction: Receives the GET function request.
  handler: faction in functions/references.ts
  trust: external-request
- rpc globalSearch: Receives the GET function request.
  handler: globalSearch in functions/references.ts
  trust: external-request
- rpc units: Receives the GET function request.
  handler: units in functions/references.ts
  trust: external-request
- rpc combatUnits: Receives the GET function request.
  handler: combatUnits in functions/references.ts
  trust: external-request
- rpc factionDatasheets: Receives the GET function request.
  handler: factionDatasheets in functions/references.ts
  trust: external-request
- rpc datasheet: Receives the GET function request.
  handler: datasheet in functions/references.ts
  trust: external-request
- rpc loadoutDatasheets: Receives the POST function request.
  handler: loadoutDatasheets in functions/references.ts
  trust: external-request
- rpc combatantDatasheet: Receives the POST function request.
  handler: combatantDatasheet in functions/references.ts
  trust: external-request
- rpc savedRosterLoadoutDatasheets: Receives the GET function request.
  handler: savedRosterLoadoutDatasheets in functions/references.ts
  trust: external-request
- rpc unitWounds: Receives the GET function request.
  handler: unitWounds in functions/references.ts
  trust: external-request
- rpc datasheetBySlug: Receives the GET function request.
  handler: datasheetBySlug in functions/references.ts
  trust: external-request
- rpc detachmentRules: Receives the GET function request.
  handler: detachmentRules in functions/references.ts
  trust: external-request
- rpc detachmentDetail: Receives the GET function request.
  handler: detachmentDetail in functions/references.ts
  trust: external-request
- rpc deployments: Receives the GET function request.
  handler: deployments in functions/references.ts
  trust: external-request
- rpc gameReferences: Receives the GET function request.
  handler: gameReferences in functions/references.ts
  trust: external-request
- rpc ruleIndex: Receives the GET function request.
  handler: ruleIndex in functions/references.ts
  trust: external-request
- rpc ruleSection: Receives the GET function request.
  handler: ruleSection in functions/references.ts
  trust: external-request
- rpc terrainReferences: Receives the GET function request.
  handler: terrainReferences in functions/references.ts
  trust: external-request
- rpc priceRoster: Receives the POST function request.
  handler: priceRoster in functions/rosters.ts
  trust: external-request
- rpc savedRosterSummaries: Receives the GET function request.
  handler: savedRosterSummaries in functions/rosters.ts
  trust: external-request
- rpc playerRosters: Receives the GET function request.
  handler: playerRosters in functions/rosters.ts
  trust: external-request
- rpc savedRosterTotals: Receives the GET function request.
  handler: savedRosterTotals in functions/rosters.ts
  trust: external-request
- rpc sharedRoster: Receives the GET function request.
  handler: sharedRoster in functions/rosters.ts
  trust: external-request
- rpc rosterAccess: Receives the GET function request.
  handler: rosterAccess in functions/rosters.ts
  trust: external-request
- rpc savedRosterStatus: Receives the GET function request.
  handler: savedRosterStatus in functions/rosters.ts
  trust: external-request
- rpc rosterBootstrap: Receives the GET function request.
  handler: rosterBootstrap in functions/rosters.ts
  trust: external-request
- rpc rosterChanges: Receives the GET function request.
  handler: rosterChanges in functions/rosters.ts
  trust: external-request
- rpc savedRosterPrice: Receives the GET function request.
  handler: savedRosterPrice in functions/rosters.ts
  trust: external-request
- rpc saveRoster: Receives the POST function request.
  handler: saveRoster in functions/rosters.ts
  trust: external-request
- rpc deleteRoster: Receives the POST function request.
  handler: deleteRoster in functions/rosters.ts
  trust: external-request
- rpc setRosterVisibility: Receives the POST function request.
  handler: setRosterVisibility in functions/rosters.ts
  trust: external-request
- rpc importRoster: Receives the POST function request.
  handler: importRoster in functions/rosters.ts
  trust: external-request
- rpc exportRoster: Receives the POST function request.
  handler: exportRoster in functions/rosters.ts
  trust: external-request

## invariants

- mutation origin before work: The shared mutation RPC checks request origin before state-changing work runs.
  protects: requireMutationOrigin in src/server/mutationOrigin.ts
  chokepoint: src/server/rpc.ts
  over: ordinary cookie requests and forwarded-host mutation requests with accepted and foreign origins
  via: preserves mutation origin checks
  because: a foreign site must not use an authenticated browser cookie to mutate account state
  crossing: external-request -> validated-data
  refuted: disabled request Origin verification -> the mutation conformance test failed, then passed after restoration (2026-09-25)
  kinds: message
  checklist: destination-confinement dismissed: this receiver follows no outbound destination
  checklist: message-authenticity dismissed: Origin is a browser request check, not a signed message
  checklist: input-validation declared as mutation origin before work
  checklist: retry-recognition dismissed: an origin check has no retry state
  checklist: duplicate-suppression dismissed: an origin check has no deduplication identity
  checklist: keyed-ordering dismissed: an origin check routes no messages
  checklist: acknowledgment-barrier dismissed: the function returns synchronously before mutation work begins
  checklist: retry-classification dismissed: this boundary refuses or accepts a request and does not schedule retries
- league warlord count: Completing a doubles team seal refuses a team without exactly one eligible Warlord.
  over: the second seal of a doubles team whose two rosters contain no eligible Warlord
  via: rejects the seal that would complete a doubles team without exactly one Warlord
  because: one team-wide leader is required before a doubles entry can be sealed
  crossing: validated-data -> persisted-record
  refuted: accepted zero Warlords at a completed doubles seal -> the doubles seal test failed, then passed after restoration (2026-09-25)
  kinds: state
  checklist: revalidated-permission dismissed: this bullet checks roster composition, not a resumed actor permission
  checklist: separation-of-duties dismissed: teammates are not requester and approver roles
  checklist: legal-state-succession declared as league warlord count
  checklist: supersession-safety dismissed: sealing is a transaction, not a late asynchronous publication
  checklist: worker-fencing dismissed: no worker lease or ownership generation exists here
  checklist: commit-ordered-effects dismissed: this seal issues no irreversible external effect
  checklist: resumption-coverage dismissed: this seal has no batch checkpoint
