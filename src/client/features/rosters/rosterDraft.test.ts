import { expect, it } from 'vitest'
import type { RosterPick } from '../../../core/roster'
import { picksSchema } from '../../../server/schemas'
import { positionedPicks } from './rosterPicks'
import { draftKey, savedDraft } from './rosterDraft'

const prep = { stratagems: [], secondaries: [] }

const roster = (picks: RosterPick[]) => ({
  id: 'list',
  name: 'Cursed Skyshroud',
  catalogueId: 'necrons',
  detachmentIds: ['cursed-legion'],
  disposition: null,
  limit: 2000,
  picks,
  waivedRules: [],
  visibility: 'private' as const,
  source: 'editable' as const,
})

const picks: RosterPick[] = [
  { entryId: 'overlord', choices: { enhancement: 'circlet' }, toggles: { warlord: 1 } },
  { entryId: 'warriors', models: 20, spreads: { weapons: { gauss: 15, reaper: 5 } } },
  { entryId: 'cryptek', attachedTo: 1 },
]

/** What the builder sends for picks it has not touched: keyed as it loads them, then positioned. */
const untouched = (stored: RosterPick[]) => ({
  ...savedDraft(roster(stored), prep),
  picks: positionedPicks(stored.map((pick, key) => ({ ...pick, key }))),
})

it('sees an unchanged list read back from its row as the draft already saved', () => {
  const stored = picksSchema.parse(JSON.parse(JSON.stringify(positionedPicks(picks.map((pick, key) => ({ ...pick, key }))))))

  expect(draftKey(untouched(stored))).toBe(draftKey(savedDraft(roster(stored), prep)))
})

it('sees an edit as a draft to save', () => {
  const edited = {
    ...untouched(picks),
    picks: positionedPicks(picks.map((pick, key) => ({ ...pick, key, models: key === 1 ? 10 : pick.models }))),
  }

  expect(draftKey(edited)).not.toBe(draftKey(savedDraft(roster(picks), prep)))
})

it('sees picks the builder rewrote while loading as a draft to save', () => {
  const dangling: RosterPick[] = [{ entryId: 'cryptek', attachedTo: 4 }]

  expect(draftKey(untouched(dangling))).not.toBe(draftKey(savedDraft(roster(dangling), prep)))
})

it('sees a list with no prep stored as the empty prep the builder sends', () => {
  const sent = { ...untouched(picks), prep: { stratagems: [], secondaries: [], reminders: [], remindersEnabled: true } }

  expect(draftKey(sent)).toBe(draftKey(savedDraft(roster(picks), prep)))
})
