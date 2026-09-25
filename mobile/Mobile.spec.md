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

- callback challenge binding: The native auth callback parser rejects a callback whose challenge differs from the pending proof.
  over: a correctly shaped callback with a valid token but a challenge different from the pending proof
  via: rejects auth callbacks with a different pending challenge
  because: a callback token must stay bound to the sign-in proof started on this device
  crossing: device-state -> validated-data
  refuted: accepted any nonempty callback challenge -> the mismatched-proof test failed, then passed after restoration (2026-09-25)
  kinds: message
  checklist: destination-confinement dismissed: the parser returns a value and follows no outbound destination
  checklist: message-authenticity declared as callback challenge binding
  checklist: input-validation declared as callback challenge binding
  checklist: retry-recognition dismissed: the parser retains no completed exchange state
  checklist: duplicate-suppression dismissed: the shell handles repeated tokens after parsing
  checklist: keyed-ordering dismissed: callback parsing has no ordered transport lane
  checklist: acknowledgment-barrier dismissed: parsing does not acknowledge external work
  checklist: retry-classification dismissed: the parser returns an error rather than choosing a retry policy
