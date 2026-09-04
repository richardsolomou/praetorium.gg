import { describe, expect, it } from 'vitest'
import { ROSTER_NAME_MAX_LENGTH } from './battle'
import { rosterLabel } from './rosterLabel'

const hypercrypt = {
  detachmentNames: ['Hypercrypt Legion'],
  limit: 1000,
  units: [
    { name: "C'tan Shard of the Nightbringer", points: 330 },
    { name: 'Hexmark Destroyer', points: 90, warlord: true },
    { name: 'Necron Warriors', points: 100 },
  ],
}

describe('the label a list falls back on', () => {
  it('names the detachment, the size, the centrepiece and the Warlord', () => {
    expect(rosterLabel(hypercrypt)).toBe("HL 1K - C'tan & Hexmark")
  })

  it('runs several detachments together as one set of initials', () => {
    expect(rosterLabel({ ...hypercrypt, detachmentNames: ['Cursed Legion', 'Skyshroud Spearhead'], limit: 2000 })).toBe(
      "CLSS 2K - C'tan & Hexmark",
    )
  })

  it('keeps a single-word detachment whole, because one initial says nothing', () => {
    expect(rosterLabel({ detachmentNames: ['Warhost'], limit: 2000, units: [] })).toBe('Warhost 2K')
  })

  it('reads a size that is not a round thousand as itself', () => {
    expect(rosterLabel({ detachmentNames: ['Hypercrypt Legion'], limit: 600, units: [] })).toBe('HL 600')
  })

  it('falls back to the faction before a detachment is picked', () => {
    expect(rosterLabel({ factionName: 'Necrons', limit: 2000 })).toBe('Necrons 2K')
  })

  it('is the setup alone while a library row waits for its totals', () => {
    expect(rosterLabel({ detachmentNames: ['Hypercrypt Legion'], limit: 1000 })).toBe('HL 1K')
  })

  it('says one name when the Warlord is also the centrepiece', () => {
    expect(
      rosterLabel({
        detachmentNames: ['Hypercrypt Legion'],
        limit: 1000,
        units: [
          { name: 'Imotekh the Stormlord', points: 300, warlord: true },
          { name: 'Necron Warriors', points: 100 },
        ],
      }),
    ).toBe('HL 1K - Imotekh')
  })

  it('takes the article off a name that is the whole name', () => {
    // "The Silent King" shortened to its first word leaves "Silent", which is not
    // what anybody calls him.
    expect(
      rosterLabel({ detachmentNames: ['Awakened Dynasty'], limit: 2000, units: [{ name: 'The Silent King', points: 420, warlord: true }] }),
    ).toBe('AD 2K - Silent King')
  })

  it('looks past an article to the word a model is known by', () => {
    expect(
      rosterLabel({ detachmentNames: ['Invasion Fleet'], limit: 2000, units: [{ name: 'The Swarmlord', points: 240, warlord: true }] }),
    ).toBe('IF 2K - Swarmlord')
  })

  it('drops the punctuation a title hangs off a name', () => {
    expect(
      rosterLabel({
        detachmentNames: ['Awakened Dynasty'],
        limit: 2000,
        units: [{ name: 'Szarekh, the Silent King', points: 400, warlord: true }],
      }),
    ).toBe('AD 2K - Szarekh')
  })

  it('names one model rather than the same model twice', () => {
    expect(
      rosterLabel({
        detachmentNames: ['Hypercrypt Legion'],
        limit: 1000,
        units: [
          { name: 'Hexmark Destroyer', points: 90 },
          { name: 'Hexmark Destroyer', points: 90, warlord: true },
        ],
      }),
    ).toBe('HL 1K - Hexmark')
  })

  it('gives up its second model rather than a truncated word', () => {
    const label = rosterLabel({
      detachmentNames: ['Hypercrypt Legion'],
      limit: 1000,
      units: [
        { name: `${'Nightbringer'.repeat(6)} Shard`, points: 330 },
        { name: 'Hexmark Destroyer', points: 90, warlord: true },
      ],
    })
    expect({ within: label.length <= ROSTER_NAME_MAX_LENGTH, label }).toEqual({
      within: true,
      label: `HL 1K - ${'Nightbringer'.repeat(6)}`,
    })
  })

  it('is the setup alone when even one model will not fit', () => {
    expect(
      rosterLabel({
        detachmentNames: ['Hypercrypt Legion'],
        limit: 1000,
        units: [{ name: 'Nightbringer'.repeat(10), points: 330 }],
      }),
    ).toBe('HL 1K')
  })
})
