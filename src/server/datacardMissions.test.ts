import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { missionCardsFromDatacards } from './datacardMissions'
import { readMissionPacks } from './missionPacks'
import { twistsIn } from './missionTwists'
import { wordsFrom } from './sourceTexts.fixtures'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-missions-'))
fs.mkdirSync(path.join(directory, 'missions'))
fs.writeFileSync(
  path.join(directory, 'missions', 'pack.json'),
  JSON.stringify({
    id: 'pack',
    name: { en: 'Chapter Approved' },
    secondaryMissions: [
      {
        id: 'beacon',
        name: { en: 'Beacon' },
        description: {
          en: 'WHEN DRAWN: If there are no enemy units on the battlefield, you can discard this card and draw one new Secondary Mission card.',
        },
        objectives: [
          {
            whenText: { en: 'End of your turn' },
            scoring: [{ victoryPoints: 2, inputType: 'stepper', scoringCriteria: { en: 'For each objective you control.' } }],
          },
        ],
      },
    ],
    missionTwists: [{ id: 'night', name: { en: 'Night Fighting' }, rules: { en: 'Replace the Primary Mission card.' } }],
  }),
)
const card = () => missionCardsFromDatacards(readMissionPacks(directory)).secondaries[0]!
const words = wordsFrom(directory)

describe('what a mission pack publishes', () => {
  it('publishes a card without its words', () => {
    expect(card().text).not.toContain('WHEN DRAWN')
  })

  it('publishes a card a reader can load the words of', () => {
    expect(words(card().text!)).toBe(
      'WHEN DRAWN: If there are no enemy units on the battlefield, you can discard this card and draw one new Secondary Mission card.',
    )
  })

  it('publishes what a payout asks for without its words', () => {
    expect(words(card().awards[0]!.criteria!)).toBe('For each objective you control.')
  })

  it('reads a per-each payout from words it does not publish', () => {
    expect(card().awards[0]?.per).toBe('each')
  })

  it('publishes the condition a when-drawn rule names as words a reader can load', () => {
    expect(words(card().whenDrawn!.condition!)).toBe('there are no enemy units on the battlefield')
  })

  it('reads that a twist rewrites the primary mission from words it does not publish', () => {
    expect(twistsIn(readMissionPacks(directory)).get('chapter-approved')?.[0]).toMatchObject({ changesPrimary: true })
  })
})
