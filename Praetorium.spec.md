# Praetorium

Build Warhammer 40,000 armies against a verified community catalogue and track battles from setup to final score.

## trust levels

- visitor (outside): an unauthenticated caller (browser, crawler, reference API client or webhook sender); it may read only public reference data and watchable battles
- player (outside): a signed-in account's request; its own rosters, seats and league entries are its to change, everything else is checked
- agent (outside): an OAuth-authorized MCP client acting for a player within the scopes the player granted
- upstream (outside): community catalogue sources (BSData, MFM, Game Datacards, Battlemaster) before snapshot verification
- operator: a maintainer, CI job or scheduled task holding deployment credentials
- account store: the SQLite account database with sessions, credentials and OAuth grants
- product store: the SpacetimeDB database holding rosters, battles, leagues and friendships
- verified catalogue: a checksummed catalogue snapshot the release pins or the publisher verified

## invariants
