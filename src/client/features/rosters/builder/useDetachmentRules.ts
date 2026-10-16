import { useQueries } from '@tanstack/react-query'
import { useCallback } from 'react'
import { detachmentRuleSubject } from '../../../../core/reminders'
import { detachmentDetailQuery } from '../../../queries'

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
      (details: { data?: { rules: { name: string; description: string | null }[] } | null }[]) =>
        detachmentIds.flatMap((id, at) => details[at]?.data?.rules.map((rule) => detachmentRuleSubject(id, rule)) ?? []),
      [detachmentIds],
    ),
  })
}
