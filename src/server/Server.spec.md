# Server

Application services, authentication, catalogue loading and projection, the agent tools, and the SpacetimeDB repository.

## invariants

- signed apple notifications: An Apple account notification changes an account only when its payload verifies against Apple's signing key for this app.
  over: the notification payloads appleNotificationResponse receives, signed by the expected key and by an unrelated one
  via: rejects unsigned notifications and acknowledges email relay changes
  because: the endpoint is public and a verified account-delete event deletes the player's account; an unsigned or foreign payload must change nothing
  crossing: visitor -> account store
  refuted: appleNotificationResponse decoded the payload without verifying it -> rejects unsigned notifications and acknowledges email relay changes failed (2026-10-06)
  kinds: message
  checklist: destination-confinement dismissed: the endpoint answers Apple and sends nothing onward
  checklist: message-authenticity declared as signed apple notifications
  checklist: input-validation dismissed: the body is size-bounded and schema-parsed before verification; the verification is the invariant
  checklist: retry-recognition dismissed: deleting an already deleted account is a no-op
  checklist: duplicate-suppression dismissed: a repeated event deletes nothing new
  checklist: keyed-ordering dismissed: events are independent per account
  checklist: acknowledgment-barrier dismissed: Apple retries on failure and the effect is idempotent
  checklist: retry-classification dismissed: verification failures answer 400 and are not retried by design
