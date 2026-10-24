import { describe, expect, it } from 'vitest'
import { abilityRemindersFromRosters } from '../core/reminders'
import { datasheetReminderAbilities, fieldingReminders } from '../shared/reminderAbilities'
import type { LoadedRules } from '../shared/rules'
import { ability, bookOf } from './catalogue.fixtures'

const book = bookOf({
  sharedRules: [{ id: 'deep-strike-rule', name: 'Deep Strike', description: 'Arrive from reserves.' }],
  sharedSelectionEntries: [{ id: 'orb', name: 'Orb', type: 'upgrade', profiles: [ability('orb-ability', 'Resurrection Orb')] }],
  selectionEntries: [
    {
      id: 'lord',
      name: 'Lord',
      type: 'model',
      profiles: [ability('shroud', 'Translocation Shroud')],
      infoGroups: [
        {
          id: 'core',
          name: 'Core',
          infoLinks: [{ id: 'lord-deep-strike', targetId: 'deep-strike-rule', name: 'Deep Strike', type: 'rule' }],
        },
      ],
    },
    {
      id: 'warrior',
      name: 'Warrior',
      type: 'model',
      infoGroups: [
        {
          id: 'core',
          name: 'Core',
          infoLinks: [{ id: 'warrior-deep-strike', targetId: 'deep-strike-rule', name: 'Deep Strike', type: 'rule' }],
        },
      ],
    },
  ],
})
const roster = { catalogueId: 'cat', detachmentIds: [], picks: [{ entryId: 'lord' }, { entryId: 'warrior' }, { entryId: 'lord' }] }
const timings = [{ moment: 'turn-start' as const, phase: null, turn: 'your-turn' as const }]
const units = roster.picks.map((pick, key) => ({ key, name: pick.entryId, choices: [] }))

describe('the abilities a roster’s units hold for alerts', () => {
  it('names a datasheet ability on each unit showing it', () => {
    expect(datasheetReminderAbilities(book, null, roster).map(([key, abilities]) => [key, abilities.includes('datasheet:shroud')])).toEqual(
      [
        [0, true],
        [1, false],
        [2, true],
      ],
    )
  })

  it('names a core ability alike on every datasheet linking it', () => {
    expect(datasheetReminderAbilities(book, null, roster).every(([, abilities]) => abilities.includes('core:deep-strike'))).toBe(true)
  })

  it('freezes an alert for every unit holding the ability', () => {
    expect(
      fieldingReminders(book, null, roster, units, [
        { key: 'datasheet:shroud', ability: 'Translocation Shroud', description: '', timings },
      ]).map((reminder) => reminder.unit?.index),
    ).toEqual([0, 2])
  })

  it('freezes an alert for a chosen enhancement', () => {
    expect(
      fieldingReminders(
        book,
        null,
        roster,
        [{ key: 1, name: 'Warrior', choices: [{ kind: 'enhancement', chosen: 'casket' }] }],
        [{ key: 'enhancement:casket', ability: 'Casket', description: '', timings }],
      ).map((reminder) => reminder.key),
    ).toEqual(['enhancement:casket:1'])
  })

  describe('a detachment upgrade the datasheet lists as wargear', () => {
    const upgradeBook = bookOf({
      selectionEntries: [
        {
          id: 'incursors',
          name: 'Incursor Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'dark',
              name: 'Death in the Dark',
              type: 'upgrade',
              constraints: [{ id: 'min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
              profiles: [ability('dark-ability', 'Death in the Dark')],
            },
          ],
        },
      ],
    } as never)
    const detachment = {
      id: 'assets',
      name: 'Subversion Assets',
      points: null,
      dispositions: [],
      rules: [],
      enhancements: [],
      stratagems: [],
    }
    const rules = {
      factionKeys: new Map(),
      detachmentDetails: new Map([
        [
          'test-catalogue',
          new Map([['assets', { ...detachment, upgrades: [{ name: 'Death in the Dark', points: 15, description: '' }] }]]),
        ],
      ]),
    } as Partial<LoadedRules> as LoadedRules
    const upgradeRoster = { catalogueId: 'cat', detachmentIds: [], picks: [{ entryId: 'incursors' }] }

    it('keys it as the upgrade the builder shows', () => {
      expect(datasheetReminderAbilities(upgradeBook, rules, upgradeRoster)).toEqual([[0, ['upgrade:dark-ability']]])
    })

    it('fields an alert a roster kept on a unit before alerts moved to the account', () => {
      const legacy = {
        key: 'upgrade:dark-ability:0',
        ability: 'Death in the Dark',
        description: '',
        unit: { index: 0, name: 'Incursors' },
        timings,
      }
      expect(
        fieldingReminders(
          upgradeBook,
          rules,
          upgradeRoster,
          [{ key: 0, name: 'Incursor Squad', choices: [] }],
          abilityRemindersFromRosters([{ updatedAt: 0, reminders: [legacy] }]),
        ).map((reminder) => reminder.key),
      ).toEqual(['upgrade:dark-ability:0'])
    })
  })
})
