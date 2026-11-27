import { expect, it } from 'vitest'
import { datasheetAbilitySummary } from '../../../../shared/vsDataAbilities'
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
  const printed = [{ id: 'ability:chaos-daemons.blood-legion.murdercall', summary }]
  expect([
    datasheetAbilitySummary(units, 'titan', undefined, printed),
    datasheetAbilitySummary(units, owner.split('#')[1]!, undefined, printed),
  ]).toEqual([null, summary])
})

it('reads a detachment BSData marks unfinished as the detachment the rest name', () =>
  expect(
    detachmentRuleOwners('marines', { slug: 'space-marines', detachments: [{ id: 'support', slug: 'deathwatch-support-its-not-ready' }] })
      .support,
  ).toBe(detachmentRuleOwners('marines', { slug: 'space-marines', detachments: [{ id: 'support', slug: 'deathwatch-support' }] }).support))
