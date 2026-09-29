# Server

Authenticate requests and coordinate catalogue, application, and persistence work.

## entrances

- me: Receives a GET server function request for me.
  handler: me in functions/accounts.ts
  trust: external-request
- onboarding progress: Receives a GET server function request for onboarding progress.
  handler: onboardingProgress in functions/accounts.ts
  trust: external-request
- update onboarding progress: Receives a POST server function request for update onboarding progress.
  handler: updateOnboardingProgress in functions/accounts.ts
  trust: external-request
- battle audience: Receives a GET server function request for battle audience.
  handler: battleAudience in functions/accounts.ts
  trust: external-request
- set battle audience: Receives a POST server function request for set battle audience.
  handler: setBattleAudience in functions/accounts.ts
  trust: external-request
- admin users: Receives a GET server function request for admin users.
  handler: adminUsers in functions/accounts.ts
  trust: external-request
- account methods: Receives a GET server function request for account methods.
  handler: accountMethods in functions/accounts.ts
  trust: external-request
- set own password: Receives a POST server function request for set own password.
  handler: setOwnPassword in functions/accounts.ts
  trust: external-request
- unlink own account: Receives a POST server function request for unlink own account.
  handler: unlinkOwnAccount in functions/accounts.ts
  trust: external-request
- set admin role: Receives a POST server function request for set admin role.
  handler: setAdminRole in functions/accounts.ts
  trust: external-request
- user profile: Receives a GET server function request for user profile.
  handler: userProfile in functions/accounts.ts
  trust: external-request
- opponents: Receives a GET server function request for opponents.
  handler: opponents in functions/accounts.ts
  trust: external-request
- friendships: Receives a GET server function request for friendships.
  handler: friendships in functions/accounts.ts
  trust: external-request
- active friend invite: Receives a GET server function request for active friend invite.
  handler: activeFriendInvite in functions/accounts.ts
  trust: external-request
- friend invite: Receives a GET server function request for friend invite.
  handler: friendInvite in functions/accounts.ts
  trust: external-request
- create friend invite: Receives a POST server function request for create friend invite.
  handler: createFriendInvite in functions/accounts.ts
  trust: external-request
- cancel friend invite: Receives a POST server function request for cancel friend invite.
  handler: cancelFriendInvite in functions/accounts.ts
  trust: external-request
- accept friend invite: Receives a POST server function request for accept friend invite.
  handler: acceptFriendInvite in functions/accounts.ts
  trust: external-request
- search players: Receives a GET server function request for search players.
  handler: searchPlayers in functions/accounts.ts
  trust: external-request
- request friend: Receives a POST server function request for request friend.
  handler: requestFriend in functions/accounts.ts
  trust: external-request
- accept friend: Receives a POST server function request for accept friend.
  handler: acceptFriend in functions/accounts.ts
  trust: external-request
- reject friend: Receives a POST server function request for reject friend.
  handler: rejectFriend in functions/accounts.ts
  trust: external-request
- remove friend: Receives a POST server function request for remove friend.
  handler: removeFriend in functions/accounts.ts
  trust: external-request
- collection: Receives a GET server function request for collection.
  handler: collection in functions/accounts.ts
  trust: external-request
- set owned: Receives a POST server function request for set owned.
  handler: setOwned in functions/accounts.ts
  trust: external-request
- favourite factions: Receives a GET server function request for favourite factions.
  handler: favouriteFactions in functions/accounts.ts
  trust: external-request
- set favourite faction: Receives a POST server function request for set favourite faction.
  handler: setFavouriteFaction in functions/accounts.ts
  trust: external-request
- favourite detachments: Receives a GET server function request for favourite detachments.
  handler: favouriteDetachments in functions/accounts.ts
  trust: external-request
- set favourite detachment: Receives a POST server function request for set favourite detachment.
  handler: setFavouriteDetachment in functions/accounts.ts
  trust: external-request
- sign in options: Receives a GET server function request for sign in options.
  handler: signInOptions in functions/accounts.ts
  trust: external-request
- my battles: Receives a GET server function request for my battles.
  handler: myBattles in functions/battles.ts
  trust: external-request
- public battles: Receives a GET server function request for public battles.
  handler: publicBattles in functions/battles.ts
  trust: external-request
- friend battles: Receives a GET server function request for friend battles.
  handler: friendBattles in functions/battles.ts
  trust: external-request
- standings: Receives a GET server function request for standings.
  handler: standings in functions/battles.ts
  trust: external-request
- player profile: Receives a GET server function request for player profile.
  handler: playerProfile in functions/battles.ts
  trust: external-request
- player rankings: Receives a GET server function request for player rankings.
  handler: playerRankings in functions/battles.ts
  trust: external-request
- shared battles: Receives a GET server function request for shared battles.
  handler: sharedBattles in functions/battles.ts
  trust: external-request
- open battle: Receives a GET server function request for open battle.
  handler: openBattle in functions/battles.ts
  trust: external-request
- league battle options: Receives a GET server function request for league battle options.
  handler: leagueBattleOptions in functions/battles.ts
  trust: external-request
- create battle: Receives a POST server function request for create battle.
  handler: createBattle in functions/battles.ts
  trust: external-request
- delete battle: Receives a POST server function request for delete battle.
  handler: deleteBattle in functions/battles.ts
  trust: external-request
- submit: Receives a POST server function request for submit.
  handler: submit in functions/battles.ts
  trust: external-request
- battle report: Receives a GET server function request for battle report.
  handler: battleReport in functions/battles.ts
  trust: external-request
- catalogue change log: Receives a GET server function request for catalogue change log.
  handler: catalogueChangeLog in functions/changes.ts
  trust: external-request
- list leagues: Receives a GET server function request for list leagues.
  handler: listLeagues in functions/leagues.ts
  trust: external-request
- open league: Receives a GET server function request for open league.
  handler: openLeague in functions/leagues.ts
  trust: external-request
- list league battles: Receives a GET server function request for list league battles.
  handler: listLeagueBattles in functions/leagues.ts
  trust: external-request
- create league: Receives a POST server function request for create league.
  handler: createLeague in functions/leagues.ts
  trust: external-request
- join league: Receives a POST server function request for join league.
  handler: joinLeague in functions/leagues.ts
  trust: external-request
- moderate league entry: Receives a POST server function request for moderate league entry.
  handler: moderateLeagueEntry in functions/leagues.ts
  trust: external-request
- submit league roster: Receives a POST server function request for submit league roster.
  handler: submitLeagueRoster in functions/leagues.ts
  trust: external-request
- reveal league: Receives a POST server function request for reveal league.
  handler: revealLeague in functions/leagues.ts
  trust: external-request
- open league roster: Receives a GET server function request for open league roster.
  handler: openLeagueRoster in functions/leagues.ts
  trust: external-request
- unseal league roster: Receives a POST server function request for unseal league roster.
  handler: unsealLeagueRoster in functions/leagues.ts
  trust: external-request
- create league event: Receives a POST server function request for create league event.
  handler: createLeagueEvent in functions/leagues.ts
  trust: external-request
- update league event: Receives a POST server function request for update league event.
  handler: updateLeagueEvent in functions/leagues.ts
  trust: external-request
- assign league roster requirement: Receives a POST server function request for assign league roster requirement.
  handler: assignLeagueRosterRequirement in functions/leagues.ts
  trust: external-request
- assign league team: Receives a POST server function request for assign league team.
  handler: assignLeagueTeam in functions/leagues.ts
  trust: external-request
- make league recurring: Receives a POST server function request for make league recurring.
  handler: makeLeagueRecurring in functions/leagues.ts
  trust: external-request
- update league: Receives a POST server function request for update league.
  handler: updateLeague in functions/leagues.ts
  trust: external-request
- delete league: Receives a POST server function request for delete league.
  handler: deleteLeague in functions/leagues.ts
  trust: external-request
- create league battle: Receives a POST server function request for create league battle.
  handler: createLeagueBattle in functions/leagues.ts
  trust: external-request
- notification settings: Receives a GET server function request for notification settings.
  handler: notificationSettings in functions/notifications.ts
  trust: external-request
- set push notifications: Receives a POST server function request for set push notifications.
  handler: setPushNotifications in functions/notifications.ts
  trust: external-request
- register push device: Receives a POST server function request for register push device.
  handler: registerPushDevice in functions/notifications.ts
  trust: external-request
- unregister push device: Receives a POST server function request for unregister push device.
  handler: unregisterPushDevice in functions/notifications.ts
  trust: external-request
- catalogue status: Receives a GET server function request for catalogue status.
  handler: catalogueStatus in functions/references.ts
  trust: external-request
- faction index: Receives a GET server function request for faction index.
  handler: factionIndex in functions/references.ts
  trust: external-request
- faction: Receives a GET server function request for faction.
  handler: faction in functions/references.ts
  trust: external-request
- global search: Receives a GET server function request for global search.
  handler: globalSearch in functions/references.ts
  trust: external-request
- units: Receives a GET server function request for units.
  handler: units in functions/references.ts
  trust: external-request
- combat units: Receives a GET server function request for combat units.
  handler: combatUnits in functions/references.ts
  trust: external-request
- faction datasheets: Receives a GET server function request for faction datasheets.
  handler: factionDatasheets in functions/references.ts
  trust: external-request
- datasheet: Receives a GET server function request for datasheet.
  handler: datasheet in functions/references.ts
  trust: external-request
- loadout datasheets: Receives a POST server function request for loadout datasheets.
  handler: loadoutDatasheets in functions/references.ts
  trust: external-request
- combatant datasheet: Receives a POST server function request for combatant datasheet.
  handler: combatantDatasheet in functions/references.ts
  trust: external-request
- saved roster loadout datasheets: Receives a GET server function request for saved roster loadout datasheets.
  handler: savedRosterLoadoutDatasheets in functions/references.ts
  trust: external-request
- unit wounds: Receives a GET server function request for unit wounds.
  handler: unitWounds in functions/references.ts
  trust: external-request
- datasheet by slug: Receives a GET server function request for datasheet by slug.
  handler: datasheetBySlug in functions/references.ts
  trust: external-request
- detachment rules: Receives a GET server function request for detachment rules.
  handler: detachmentRules in functions/references.ts
  trust: external-request
- detachment detail: Receives a GET server function request for detachment detail.
  handler: detachmentDetail in functions/references.ts
  trust: external-request
- deployments: Receives a GET server function request for deployments.
  handler: deployments in functions/references.ts
  trust: external-request
- game references: Receives a GET server function request for game references.
  handler: gameReferences in functions/references.ts
  trust: external-request
- rule index: Receives a GET server function request for rule index.
  handler: ruleIndex in functions/references.ts
  trust: external-request
- rule section: Receives a GET server function request for rule section.
  handler: ruleSection in functions/references.ts
  trust: external-request
- terrain references: Receives a GET server function request for terrain references.
  handler: terrainReferences in functions/references.ts
  trust: external-request
- price roster: Receives a POST server function request for price roster.
  handler: priceRoster in functions/rosters.ts
  trust: external-request
- saved roster summaries: Receives a GET server function request for saved roster summaries.
  handler: savedRosterSummaries in functions/rosters.ts
  trust: external-request
- home rosters: Receives a GET server function request for home rosters.
  handler: homeRosters in functions/rosters.ts
  trust: external-request
- player rosters: Receives a GET server function request for player rosters.
  handler: playerRosters in functions/rosters.ts
  trust: external-request
- saved roster totals: Receives a GET server function request for saved roster totals.
  handler: savedRosterTotals in functions/rosters.ts
  trust: external-request
- shared roster: Receives a GET server function request for shared roster.
  handler: sharedRoster in functions/rosters.ts
  trust: external-request
- roster access: Receives a GET server function request for roster access.
  handler: rosterAccess in functions/rosters.ts
  trust: external-request
- saved roster status: Receives a GET server function request for saved roster status.
  handler: savedRosterStatus in functions/rosters.ts
  trust: external-request
- roster bootstrap: Receives a GET server function request for roster bootstrap.
  handler: rosterBootstrap in functions/rosters.ts
  trust: external-request
- roster changes: Receives a GET server function request for roster changes.
  handler: rosterChanges in functions/rosters.ts
  trust: external-request
- saved roster price: Receives a GET server function request for saved roster price.
  handler: savedRosterPrice in functions/rosters.ts
  trust: external-request
- save roster: Receives a POST server function request for save roster.
  handler: saveRoster in functions/rosters.ts
  trust: external-request
- delete roster: Receives a POST server function request for delete roster.
  handler: deleteRoster in functions/rosters.ts
  trust: external-request
- set roster visibility: Receives a POST server function request for set roster visibility.
  handler: setRosterVisibility in functions/rosters.ts
  trust: external-request
- import roster: Receives a POST server function request for import roster.
  handler: importRoster in functions/rosters.ts
  trust: external-request
- export roster: Receives a POST server function request for export roster.
  handler: exportRoster in functions/rosters.ts
  trust: external-request

- reference MCP tool: Receives a read-only reference tool call over the MCP route.
  handler: handleReferenceMcp in referenceMcp.ts
  trust: external-request
- Apple account notification: Receives an Apple account event from the notification route.
  handler: appleNotificationResponse in appleAuth.ts
  trust: external-source

## invariants

- mutation origin before work: Mutation requests check their origin before state-changing work begins.
  over: cookie requests with accepted and foreign origins, including forwarded-host requests
  via: preserves mutation origin checks
  because: a foreign site must not use an authenticated browser cookie to mutate account state
  crossing: external-request -> validated-data
  refuted: disabled the shared Origin check -> the mutation conformance test failed, then passed after restoration (2026-09-29)
  kinds: message
  checklist: destination-confinement dismissed: this receiver follows no outbound destination
  checklist: message-authenticity dismissed: Origin is a browser request check rather than a signed message
  checklist: input-validation declared as mutation origin before work
  checklist: retry-recognition dismissed: the check retains no operation result
  checklist: duplicate-suppression dismissed: origin checking has no deduplication identity
  checklist: keyed-ordering dismissed: the check routes no ordered messages
  checklist: acknowledgment-barrier dismissed: the check returns before mutation work starts
  checklist: retry-classification dismissed: the check schedules no retries
- untrusted Apple notification: An Apple notification signed by an untrusted key cannot delete an account.
  over: an account-deleted event signed by a key outside the trusted Apple key set
  via: never deletes an account for a notification signed by another key
  because: a forged provider event must not delete an account
  crossing: external-source -> persisted-record
  refuted: deleted an account before signature verification -> the forged notification test failed, then passed after restoration (2026-09-29)
  kinds: message
  checklist: destination-confinement dismissed: the notification names an account, not an outbound destination
  checklist: message-authenticity declared as untrusted Apple notification
  checklist: input-validation dismissed: this case uses valid claims to isolate signature verification
  checklist: retry-recognition dismissed: the test concerns rejection before an effect
  checklist: duplicate-suppression dismissed: this rejected event has no accepted identity to deduplicate
  checklist: keyed-ordering dismissed: the receiver does not route ordered event lanes
  checklist: acknowledgment-barrier dismissed: rejection returns 400 without accepted work
  checklist: retry-classification dismissed: the receiver does not schedule retries
