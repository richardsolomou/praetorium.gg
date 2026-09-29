# Mobile

Bridge native shell lifecycle, authentication, push, and navigation to the WebView.

## entrances

- WebView message: Receives native action and authentication requests from the loaded page.
  handler: AppShell in App.tsx
  trust: device-state
- native URL callback: Receives application links and sign-in callbacks from the platform.
  handler: AppShell in App.tsx
  trust: device-state
- notification tap: Receives a push notification selected on this device.
  handler: AppShell in App.tsx
  trust: device-state
- application state change: Receives foreground and background changes from the platform.
  handler: AppShell in App.tsx
  trust: device-state

## invariants

- callback challenge binding: An auth callback with a challenge different from the pending proof is rejected.
  over: a correctly shaped native callback with a token but a challenge different from the pending proof
  via: rejects auth callbacks with a different pending challenge
  because: a callback token must stay bound to the sign-in proof started on this device
  crossing: device-state -> validated-data
  refuted: accepted any nonempty challenge -> the mismatched-proof test failed, then passed after restoration (2026-09-29)
  kinds: message
  checklist: destination-confinement dismissed: the parser returns data and follows no outbound destination
  checklist: message-authenticity declared as callback challenge binding
  checklist: input-validation declared as callback challenge binding
  checklist: retry-recognition dismissed: parsing retains no completed exchange state
  checklist: duplicate-suppression dismissed: the shell handles repeated tokens after parsing
  checklist: keyed-ordering dismissed: callback parsing has no ordered transport lane
  checklist: acknowledgment-barrier dismissed: parsing acknowledges no external work
  checklist: retry-classification dismissed: the parser returns an error rather than scheduling retries
