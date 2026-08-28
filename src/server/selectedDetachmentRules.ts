import type { Stratagem } from '../core/battle'
import { detachmentNamed } from './factionReferences'
import type { DetachmentRulesDetail } from './rulesFactions'

export function selectedDetachmentRules(
  names: readonly string[],
  live: ReadonlyMap<string, readonly Stratagem[]> | undefined,
  details: ReadonlyMap<string, Pick<DetachmentRulesDetail, 'stratagems'>> | undefined,
) {
  return {
    live: names.flatMap((name) => detachmentNamed(live, name) ?? []),
    written: names.flatMap((name) => detachmentNamed(details, name)?.stratagems ?? []),
  }
}
