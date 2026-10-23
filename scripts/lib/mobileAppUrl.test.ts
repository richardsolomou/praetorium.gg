import { expect, it } from 'vitest'
import { mobileAppUrl } from './mobileAppUrl'

it('opens the preview at its own address on iOS', () => {
  expect(mobileAppUrl('http://127.0.0.1:3004', 'ios')).toBe('http://127.0.0.1:3004')
})

it("reaches the preview through the emulator's host alias on Android", () => {
  expect(mobileAppUrl('http://127.0.0.1:3004', 'android')).toBe('http://10.0.2.2:3004')
})
