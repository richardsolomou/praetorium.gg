import { describe, expect, it } from 'vitest'
import { descriptionsIn } from './missionDescriptions'

const card = (name: string, description?: string) => ({
  name: { en: name },
  ...(description ? { description: { en: description } } : {}),
})

describe('reading mission card instructions', () => {
  it('reads the description but not the lore', () => {
    const descriptions = descriptionsIn([
      {
        secondaryMissions: [
          {
            ...card(
              'Beacon',
              '**WHEN DRAWN:** Select one friendly unit on the battlefield or embarked within a **TRANSPORT** on the battlefield to be your **beacon** unit.',
            ),
            lore: { en: 'Your champions taunt the foe.' },
          },
        ],
      },
    ])

    expect(descriptions.get('beacon')).toBe(
      '**WHEN DRAWN:** Select one friendly unit on the battlefield or embarked within a **TRANSPORT** on the battlefield to be your **beacon** unit.',
    )
  })

  it('reads primary and secondary cards alike', () => {
    const descriptions = descriptionsIn([
      {
        primaryMissions: [card('Take and Hold', 'Hold the objectives.')],
        secondaryMissions: [card('Beacon', 'Choose a beacon.')],
      },
    ])

    expect([...descriptions.keys()].toSorted()).toEqual(['beacon', 'take and hold'])
  })

  it('omits a card whose name appears in two packs', () => {
    const descriptions = descriptionsIn([
      { secondaryMissions: [card('Beacon', 'First wording.')] },
      { secondaryMissions: [card('Beacon', 'Second wording.')] },
    ])

    expect(descriptions.has('beacon')).toBe(false)
  })
})
