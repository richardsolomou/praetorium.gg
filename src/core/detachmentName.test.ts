import { expect, it } from 'vitest'
import { canonicalDetachmentName } from './detachmentName'

it.each([
  ['Brood Brother Auxilia', 'Brood Brothers Auxilia'],
  ['Deathwatch Support (ITS NOT READY)', 'Deathwatch Support'],
  ['Deathwatch Support', 'Deathwatch Support'],
  ['Deathwatch Support (Legends)', 'Deathwatch Support (Legends)'],
  ['Other Detachment (ITS NOT READY)', 'Other Detachment (ITS NOT READY)'],
  ['Brood Brother Vanguard', 'Brood Brother Vanguard'],
])('joins %s as %s', (name, expected) => {
  expect(canonicalDetachmentName(name)).toBe(expected)
})
