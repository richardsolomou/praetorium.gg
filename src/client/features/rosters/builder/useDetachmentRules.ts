import { useQueries } from '@tanstack/react-query'
import { useCallback } from 'react'
import { detachmentRuleSubject } from '../../../../core/reminders'
import { detachmentDetailQuery } from '../../../queries'
import { detachmentRulesOwner } from '../../../components/UnitFromVsData'

/**
 * Whose rules each of a faction's detachments holds, by detachment id, so a datasheet showing them reads their VS Data
 * records as the detachment's page does, rather than as the datasheet's own.
 */
export const detachmentRuleOwners = (
  catalogueId: string,
  faction: { slug: string; detachments: readonly { id: string; slug: string }[] } | null | undefined,
) =>
  Object.fromEntries(
    (faction?.detachments ?? []).map((detachment) => [detachment.id, detachmentRulesOwner(catalogueId, faction!.slug, detachment.slug)]),
  )

/** The rules of a list's detachments, as the datasheet's ability summary names them. */
export function useDetachmentRules(
  catalogueId: string,
  detachments: readonly { id: string; slug: string }[] | undefined,
  detachmentIds: readonly string[],
) {
  return useQueries({
    queries: detachmentIds.map((id) =>
      detachmentDetailQuery(catalogueId, detachments?.find((detachment) => detachment.id === id)?.slug ?? ''),
    ),
    combine: useCallback(
      (details: { data?: { rules: Parameters<typeof detachmentRuleSubject>[1][] } | null }[]) =>
        detachmentIds.flatMap((id, at) => details[at]?.data?.rules.map((rule) => detachmentRuleSubject(id, rule)) ?? []),
      [detachmentIds],
    ),
  })
}
