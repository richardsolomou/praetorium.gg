import { expect, it } from 'vitest'
import type { Stratagem } from '../core/battle'
import type { DetachmentRulesDetail } from './rulesFactions'
import { selectedDetachmentRules } from './selectedDetachmentRules'

it('keeps live and written battle stratagems across a compact-name difference', () => {
  const live = { key: 'live' } as Stratagem
  const written = { id: 'written' } as DetachmentRulesDetail['stratagems'][number]

  expect(
    selectedDetachmentRules(
      ['Haloscreed Battleclade'],
      new Map([['haloscreed-battle-clade', [live]]]),
      new Map([['haloscreed-battle-clade', { stratagems: [written] }]]),
    ),
  ).toEqual({ live: [live], written: [written] })
})
