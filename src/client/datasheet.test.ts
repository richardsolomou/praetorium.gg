import { describe, expect, it } from 'vitest'
import { addedKeywords, attachmentGroups, compositionCount, primaryUnitProfile, referenceAbilities } from './datasheet'

describe('primary unit profile', () => {
  const profile = (id: string, name: string, type = 'Unit') => ({ id, name, type, values: [] })

  it('uses the profile named after the datasheet instead of an optional model listed first', () => {
    const outrider = profile('outrider', 'Outrider Squad')

    expect(
      primaryUnitProfile({
        name: 'Outrider Squad',
        profiles: [profile('atv', 'Invader ATV'), outrider, profile('sergeant', 'Outrider Sergeant')],
      }),
    ).toBe(outrider)
  })

  it('matches a singular primary model after an optional model', () => {
    const guardian = profile('guardian', 'Storm Guardian')

    expect(
      primaryUnitProfile({
        name: 'Storm Guardians',
        profiles: [profile('platform', "Serpent's Scale Platform"), guardian],
      }),
    ).toBe(guardian)
  })

  it('falls back to the first unit profile when none matches the datasheet name', () => {
    const champion = profile('champion', 'Aspiring Champion')

    expect(
      primaryUnitProfile({
        name: 'Chosen',
        profiles: [profile('weapon', 'Boltgun', 'Ranged Weapons'), champion, profile('chosen', 'Chosen Warrior')],
      }),
    ).toBe(champion)
  })
})

describe('datasheet composition count', () => {
  it('adds fixed and ranged model groups', () => {
    expect(compositionCount(['**1 Deathwing Sergeant**', '**4-9 Deathwing Terminators**'])).toBe('5–10 models')
  })

  it('keeps a single-model datasheet singular', () => {
    expect(compositionCount(['**1 Overlord**'])).toBe('1 model')
  })

  it('totals each fixed composition without adding alternatives together', () => {
    expect(
      compositionCount(['**1 Shock Trooper Sergeant and 9 Shock Troopers**', 'OR', '**2 Shock Trooper Sergeants and 18 Shock Troopers**']),
    ).toBe('10–20 models')
  })
})

describe('datasheet abilities', () => {
  it('keeps attachment keywords on reference datasheets without repeating their rules', () => {
    const abilities = [
      { name: 'Leader', kind: 'core' },
      { name: 'Leader', kind: 'rule' },
      { name: 'Support', kind: 'core' },
      { name: 'Support', kind: 'rule' },
      { name: 'My Will Be Done', kind: 'datasheet' },
    ]

    expect(referenceAbilities(abilities, [{ kind: 'leader' }, { kind: 'support' }])).toEqual([abilities[0], abilities[2], abilities[4]])
  })

  it('keeps an attachment rule when the datasheet has no parsed targets', () => {
    const abilities = [{ name: 'Leader', kind: 'rule' }]

    expect(referenceAbilities(abilities, [])).toEqual(abilities)
  })

  it('groups every attachment direction in display order', () => {
    const leader = { name: 'Leader target', entryId: 'leader-target', route: null }
    const support = { name: 'Support target', entryId: 'support-target', route: null }
    const led = { name: 'Attached leader', entryId: 'attached-leader', route: null }
    const supported = { name: 'Attached support', entryId: 'attached-support', route: null }

    expect(
      attachmentGroups({
        attachments: [
          { ...leader, kind: 'leader' },
          { ...support, kind: 'support' },
        ],
        leaders: [led],
        supporters: [supported],
      }),
    ).toEqual([
      { title: 'Can lead', relationships: [{ ...leader, kind: 'leader' }] },
      { title: 'Can support', relationships: [{ ...support, kind: 'support' }] },
      { title: 'Can be led by', relationships: [led] },
      { title: 'Can be supported by', relationships: [supported] },
    ])
  })
})

describe('the keywords something in the list added to a weapon', () => {
  it('names a keyword added to a blank printed characteristic', () => {
    expect(addedKeywords({ value: 'Lethal Hits', baseValue: '' })).toEqual(['Lethal Hits'])
  })

  it('names what the printed profile does not have', () => {
    expect(addedKeywords({ value: 'Lethal Hits, Assault', baseValue: 'Lethal Hits' })).toEqual(['Assault'])
  })

  it('names nothing on an unmodified profile', () => {
    expect(addedKeywords({ value: 'Lethal Hits' })).toEqual([])
  })

  it('reads a non-breaking space as the separator the catalogue joined with', () => {
    expect(addedKeywords({ value: 'Lethal Hits,\u00a0Assault', baseValue: 'Lethal Hits' })).toEqual(['Assault'])
  })
})
