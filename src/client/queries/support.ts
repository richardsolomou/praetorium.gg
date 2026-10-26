import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { posthog, type GetTicketsResponse } from 'posthog-js'
import { supportMessagesKey, supportOpeningKey, supportTicketsKey } from './queryKeys'

const TICKET_PAGE = 20
/** Bounds a read of one conversation at a thousand messages, twenty reads of fifty. */
const MAX_MESSAGE_PAGES = 20

/** This browser's conversations, or this account's on every device once its identity is proven, a page at a time. */
export const supportTicketsQuery = (enabled: boolean) =>
  infiniteQueryOptions({
    queryKey: supportTicketsKey(),
    queryFn: async ({ pageParam }): Promise<GetTicketsResponse> =>
      (await posthog.conversations?.getTickets({ limit: TICKET_PAGE, offset: pageParam })) ?? { count: 0, results: [] },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.results.length, 0)
      return last.results.length && loaded < last.count ? loaded : undefined
    },
    enabled,
    // Support has no push channel; hidden tabs pause this and catch up when shown. A player with no conversations
    // only gains one by sending, which refreshes the list, so they are not polled.
    refetchInterval: (query) => (query.state.data?.pages[0]?.count ? 30_000 : false),
  })

/** The messages a player can see in one conversation, which marks the team's replies read. */
export const supportMessagesQuery = (ticketId: string, enabled = true) =>
  queryOptions({
    queryKey: supportMessagesKey(ticketId),
    queryFn: async ({ client }) => {
      const conversations = posthog.conversations
      const first = await conversations?.getMessages(ticketId)
      // A read returns fifty messages, oldest first, so a long conversation is read forward from its newest one so far.
      const messages = [...(first?.messages ?? [])]
      for (let page = 1, more = first?.has_more; more && page < MAX_MESSAGE_PAGES; page++) {
        const next = await conversations?.getMessages(ticketId, messages.at(-1)?.created_at)
        messages.push(...(next?.messages ?? []).filter((message) => !messages.some((seen) => seen.id === message.id)))
        more = next?.has_more && Boolean(next.messages.length)
      }
      if (first?.unread_count) {
        await conversations?.markAsRead(ticketId)
        void client.invalidateQueries({ queryKey: supportTicketsKey() })
      }
      return { status: first?.ticket_status, messages: messages.filter((message) => !message.is_private) }
    },
    enabled,
    refetchInterval: 10_000,
  })

/** A conversation's opening message, which never changes; reading it does not mark the team's replies read. */
export const openingMessageQuery = (ticketId: string) =>
  queryOptions({
    queryKey: supportOpeningKey(ticketId),
    queryFn: async () => (await posthog.conversations?.getMessages(ticketId))?.messages[0]?.content ?? null,
    staleTime: Infinity,
  })
