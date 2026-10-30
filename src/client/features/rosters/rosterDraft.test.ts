import { expect, it } from 'vitest'
import type { RosterPick } from '../../../core/roster'
import { picksSchema } from '../../../contracts/schemas'
import { positionedAnnotatedPicks, positionedPicks } from './rosterPicks'
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
  { entryId: 'overlord', choices: { enhancement: 'circlet' }, toggles: { warlord: 1 }, nickname: 'The Phaeron' },
  { entryId: 'warriors', models: 20, spreads: { weapons: { gauss: 15, reaper: 5 } }, note: 'Hold the centre.' },
  { entryId: 'cryptek', attachedTo: 1 },
]

/** What the builder sends for picks it has not touched: keyed as it loads them, then positioned. */
const untouched = (stored: RosterPick[]) => ({
  ...savedDraft(roster(stored), prep),
  picks: positionedAnnotatedPicks(stored.map((pick, key) => ({ ...pick, key }))),
})

it('sees an unchanged list read back from its row as the draft already saved', () => {
  const stored = picksSchema.parse(JSON.parse(JSON.stringify(positionedAnnotatedPicks(picks.map((pick, key) => ({ ...pick, key }))))))

  expect(draftKey(untouched(stored))).toBe(draftKey(savedDraft(roster(stored), prep)))
})

it('sends an empty name for a roster whose generated name is stored', () => {
  expect(savedDraft({ ...roster([]), name: 'CL 2K', automaticName: true }, prep).name).toBe('')
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

it.each([
  ['rewritten note', { note: 'Lead from the front.' }],
  ['renamed unit', { nickname: 'Szarekh' }],
  ['changed starting embark', { embarkedIn: 2 }],
] as const)('sees a %s as a draft to save', (_, change) => {
  const changed = {
    ...untouched(picks),
    picks: positionedAnnotatedPicks(picks.map((pick, key) => ({ ...pick, key, ...(key === 0 ? change : {}) }))),
  }

  expect(draftKey(changed)).not.toBe(draftKey(savedDraft(roster(picks), prep)))
})

it('saves a starting embark at the position of its transport', () => {
  const keyed = picks.map((pick, key) => ({ ...pick, key: key + 10, ...(key === 1 ? { embarkedIn: 12 } : {}) }))

  expect(positionedAnnotatedPicks(keyed)[1]?.embarkedIn).toBe(2)
})

it('prices the same picks wherever they start', () => {
  expect(positionedPicks(picks.map((pick, key) => ({ ...pick, key, embarkedIn: 2 })))).toEqual(
    positionedPicks(picks.map((pick, key) => ({ ...pick, key }))),
  )
})

it('prices the same picks whatever their nicknames and notes say', () => {
  const plain = picks.map(({ nickname: _nickname, note: _note, ...pick }, key) => ({ ...pick, key }))

  expect(positionedPicks(picks.map((pick, key) => ({ ...pick, key })))).toEqual(positionedPicks(plain))
})

it('sees a list with no prep stored as the empty prep the builder sends', () => {
  const sent = { ...untouched(picks), prep: { stratagems: [], secondaries: [], remindersEnabled: true } }

  expect(draftKey(sent)).toBe(draftKey(savedDraft(roster(picks), prep)))
})
