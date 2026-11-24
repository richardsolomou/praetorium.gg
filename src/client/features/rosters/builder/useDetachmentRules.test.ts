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
