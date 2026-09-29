import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NamedRosterDifferences } from '../../../core/rosterDifferences'
import { dispositionTone } from '../../components/rosterSetup'
import { RosterDifferenceChips } from './RosterDifferences'

const none: NamedRosterDifferences = {
  baseId: 'base',
  baseName: 'Dynasty 2K',
  setup: [],
  detachments: { added: [], removed: [], replaced: false },
  added: [],
  removed: [],
  loadouts: 0,
}
const unit = (name: string, count = 1) => ({ name, count })
const detachments: Record<string, string> = { awakened: 'Awakened Dynasty', cursed: 'Cursed Legion', hypercrypt: 'Hypercrypt Legion' }
const setup = { detachmentName: (id: string) => detachments[id], disposition: { id: 'purge-the-foe', name: 'Purge the Foe' } }
const markup = (differences: Partial<NamedRosterDifferences>) =>
  renderToStaticMarkup(createElement(RosterDifferenceChips, { differences: { ...none, ...differences }, setup }))
const chips = (differences: Partial<NamedRosterDifferences>) =>
  markup(differences)
    .split(/<span[^>]*class="chip [^"]*"[^>]*>/)
    .slice(1)
    .map((chip) =>
      chip
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )

describe('the chips naming what a variant changes', () => {
  it('counts the units a variant added and removed, naming them for assistive technology', () => {
    expect(chips({ added: [unit('Lychguard'), unit('Wraiths', 2)], removed: [unit('Immortals')] })).toEqual([
      '+ 3 units : Lychguard, Wraiths ×2',
      '− 1 unit : Immortals',
    ])
  })

  it('names the detachments a variant gained and dropped', () => {
    expect(chips({ setup: ['detachment'], detachments: { added: ['hypercrypt'], removed: ['cursed'], replaced: false } })).toEqual([
      '+ Hypercrypt Legion',
      '− Cursed Legion',
    ])
  })

  it('names only the replacements when a variant kept none of its base’s detachments', () => {
    expect(
      chips({ setup: ['detachment'], detachments: { added: ['hypercrypt', 'cursed'], removed: ['awakened'], replaced: true } }),
    ).toEqual(['Replaced by Hypercrypt Legion', 'Replaced by Cursed Legion'])
  })

  it('leads with the setup, leaves out the size, and ends with loadouts', () => {
    expect(
      chips({
        setup: ['size', 'detachment', 'disposition'],
        detachments: { added: ['hypercrypt'], removed: [], replaced: false },
        added: [unit('Lychguard')],
        loadouts: 2,
      }),
    ).toEqual(['+ Hypercrypt Legion', 'Purge the Foe', '+ 1 unit : Lychguard', '2 loadouts'])
  })

  it('colours a changed disposition as every disposition chip is coloured', () => {
    expect(markup({ setup: ['disposition'] })).toContain(dispositionTone('purge-the-foe'))
  })

  it('does not call a variant that only changed its size unchanged', () => {
    expect(markup({ setup: ['size'] })).not.toContain('No changes')
  })

  it('says a variant with no changes has none', () => {
    expect(markup({})).toContain('No changes')
  })
})
