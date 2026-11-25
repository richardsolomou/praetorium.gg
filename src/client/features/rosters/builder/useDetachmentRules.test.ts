import { expect, it } from 'vitest'
import { abilitySummaryIn } from '../../../../shared/vsDataAbilities'
import type { VsDataUnits } from '../../../../shared/vsData'
import { detachmentRuleOwners } from './useDetachmentRules'

it('reads a detachment rule a datasheet shows as the detachment’s, which another faction’s datasheets may field', () => {
  const summary = { blocks: [], questions: [] }
  const units: VsDataUnits = {
    units: { titan: { id: 'titanicus-traitoris.warlord-titan', sizes: [], models: [], options: [] } },
    aliases: {},
    abilities: { 'chaos-daemons.blood-legion.murdercall': summary },
  }
  const owner = detachmentRuleOwners('titans', {
    slug: 'titanicus-traitoris',
    detachments: [{ id: 'legion', slug: 'blood-legion' }],
  }).legion!
  expect([abilitySummaryIn(units, 'titan', 'Murdercall'), abilitySummaryIn(units, owner.split('#')[1]!, 'Murdercall')]).toEqual([
    null,
    summary,
  ])
})

it('reads a detachment BSData marks unfinished by the name the rest give it, and no other detachment’s rule of that name', () => {
  const support = { blocks: [{ paragraph: [{ text: 'Deathwatch Support' }] }], questions: [] }
  const blackSpear = { blocks: [{ paragraph: [{ text: 'Black Spear' }] }], questions: [] }
  const units: VsDataUnits = {
    units: {},
    aliases: {},
    abilities: {
      'space-marines.deathwatch-support.beacon-angelis': support,
      'deathwatch.black-spear-task-force.beacon-angelis': blackSpear,
    },
  }
  const owner = detachmentRuleOwners('marines', {
    slug: 'space-marines',
    detachments: [{ id: 'support', slug: 'deathwatch-support-its-not-ready' }],
  }).support!
  expect(abilitySummaryIn(units, owner.split('#')[1]!, 'Beacon Angelis')).toBe(support)
})
