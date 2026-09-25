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
