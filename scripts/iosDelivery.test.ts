import { expect, test } from 'vitest'
import { mobileInput } from './iosDelivery'

test.each([
  'src/client/offline/localStorage.ts',
  'src/routes/index.tsx',
  'src/core/battle.ts',
  'catalogue/snapshot.json',
  'mobile/CHANGELOG.md',
  'mobile/src/localStateStorage.test.ts',
  'mobile/watch/Tests/BattleSessionTests.swift',
])('does not treat %s as a mobile delivery input', (file) => {
  expect(mobileInput(file)).toBe(false)
})

test.each([
  'mobile/src/localStateStorage.ts',
  'mobile/src/offlineReferenceStorage.ts',
  'mobile/src/appSnapshotStorage.ts',
  'mobile/App.tsx',
  'mobile/assets/icon.png',
  'mobile/modules/praetorium-watch/ios/PraetoriumWatchModule.swift',
  'mobile/watch/WatchStore.swift',
  'mobile/app.json',
  'mobile/package.json',
  'fastlane/Fastfile',
  '.github/workflows/mobile.yml',
  'pnpm-workspace.yaml',
])('treats %s as a mobile delivery input', (file) => {
  expect(mobileInput(file)).toBe(true)
})
