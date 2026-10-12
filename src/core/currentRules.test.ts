import { expect, it } from 'vitest'
import { currentRulesFor } from './currentRules'

const current = { id: 'marine-main~470a-6daa-9014-12df', isDefault: true, edition: { status: 'released' } }
const earlier = { id: 'current-rosters~470a-6daa-9014-12df', isDefault: false, edition: { status: 'released' } }
const archived = { id: 'legacy-rosters~470a-6daa-9014-12df', isDefault: false, edition: { status: 'retired' } }
const preview = { id: 'custodes-11e~1f19-6509-d906-ca10', isDefault: false, edition: { status: 'preview' } }
const custodes = { id: '1f19-6509-d906-ca10', isDefault: true }
const factions = [current, earlier, archived, preview, custodes]

it('names the current rules for a roster kept on an earlier released version', () => {
  expect(currentRulesFor(earlier.id, factions)).toBe(current)
})

it('names the current rules for a roster kept on archived rules', () => {
  expect(currentRulesFor(archived.id, factions)).toBe(current)
})

it('reports nothing for a roster already on the current rules', () => {
  expect(currentRulesFor(current.id, factions)).toBeNull()
})

it('treats preview rules as a deliberate choice rather than an older version', () => {
  expect(currentRulesFor(preview.id, factions)).toBeNull()
})

it('reports nothing when the army has no current version to move to', () => {
  expect(currentRulesFor(archived.id, [archived])).toBeNull()
})

it('reports nothing for an army it does not know', () => {
  expect(currentRulesFor('unknown', factions)).toBeNull()
})
