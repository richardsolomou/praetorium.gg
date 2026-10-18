import { describe, expect, it } from 'vitest'
import { playedArmies } from './playedArmies'
import { copiedArmy } from './rosterCopies'
import type { Roster } from './battle'

const built = {
  catalogueId: 'necrons',
  revision: 'r1',
  limit: 2_000,
  detachment: 'Awakened Dynasty',
  detachmentIds: ['awakened'],
  disposition: 'Purge the Foe',
  waivedRules: [],
  picks: [{ entryId: 'immortals', models: 10, note: 'Hold the left objective' }],
  units: [],
}
const seat = (id: string, roster: Roster | null = { id: `${id}-roster`, name: `${id} army`, text: '', built }, automated = false) => ({
  id,
  automated,
  roster,
})
const battle = (status: 'setup' | 'playing' | 'finished', players = [seat('kieran'), seat('sam')]) =>
  playedArmies(
    {
      battle: { token: 'duel', createdAt: 100 },
      players: [
        { id: 'kieran', name: 'Kieran' },
        { id: 'sam', name: 'Sam' },
      ],
      log: [{ at: 900 }],
    },
    { status, players },
  )

describe('playedArmies', () => {
  it('lists every catalogue army a finished battle fielded', () => {
    expect(battle('finished').map((army) => army.player.name)).toEqual(['Kieran', 'Sam'])
  })

  it('lists nothing of a battle still being played', () => {
    expect(battle('playing')).toEqual([])
  })

  it('dates an army by when the battle ended', () => {
    expect(battle('finished')[0]?.playedAt).toBe(900)
  })

  it('leaves out a pasted list, which names no catalogue army', () => {
    expect(battle('finished', [seat('kieran', { name: 'Pasted', text: 'Necrons' }), seat('sam')]).map((army) => army.player.id)).toEqual([
      'sam',
    ])
  })

  it('leaves out a practice opponent', () => {
    expect(battle('finished', [seat('kieran'), seat('sam', undefined, true)]).map((army) => army.player.id)).toEqual(['kieran'])
  })

  it('keeps the rules version the army was fielded under', () => {
    expect(
      battle('finished', [seat('kieran', { name: 'Old', text: '', built: { ...built, catalogueId: 'mfm-14~necrons' } })])[0]?.catalogueId,
    ).toBe('mfm-14~necrons')
  })
})

describe('copiedArmy', () => {
  const [army] = battle('finished')

  it('copies the army without its player’s notes', () => {
    expect(copiedArmy(army!).picks).toEqual([{ entryId: 'immortals', models: 10 }])
  })

  it('keeps the detachments and battle size it was fielded with', () => {
    expect(copiedArmy(army!)).toMatchObject({ detachmentIds: ['awakened'], limit: 2_000, disposition: 'Purge the Foe' })
  })
})
