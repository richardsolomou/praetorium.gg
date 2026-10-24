import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { GetTicketsResponse, TicketStatus } from 'posthog-js'
import { posthog } from 'posthog-js'
import { useEffect, useState } from 'react'
import { supportIdentity } from '../../functions'
import { meQuery } from '../../queries'

// A local dev server never loads PostHog, so it gets a stand-in with conversations to read; builds drop this.
if (import.meta.env.MODE === 'development' && typeof window !== 'undefined') {
  void import('./devSupport').then(({ installDevSupport }) => installDevSupport())
}

const SUPPORT_KEY = 'support'
const ticketsKey = () => [SUPPORT_KEY, 'tickets']
const messagesKey = (ticketId: string) => [SUPPORT_KEY, 'messages', ticketId]

const CHECK_MS = 500
// Support loads after the SDK fetches its remote config; a blocked SDK never says it has given up.
const GIVE_UP_MS = 15_000

/** Whether PostHog Support answers in this browser: undefined while the SDK may still load it. */
export function useSupportAvailable() {
  const [available, setAvailable] = useState<boolean>()
  useEffect(() => {
    if (available !== undefined) return
    const started = Date.now()
    const check = () => {
      if (posthog.conversations?.isAvailable()) setAvailable(true)
      else if (Date.now() - started > GIVE_UP_MS) setAvailable(false)
    }
    const timer = window.setInterval(check, CHECK_MS)
    check()
    return () => window.clearInterval(timer)
  }, [available])
  return available
}

/** Starts a new conversation, or null when Support cannot be reached from this browser. */
export async function startConversation(message: string, email?: string) {
  if (!posthog.conversations?.isAvailable()) return null
  return posthog.conversations.sendMessage(message, email ? { email } : undefined, true)
}

/**
 * Adds to an existing conversation. The SDK sends to whichever ticket was read last and switches as a read starts, so
 * the switch and the send happen in one step: awaiting the read between them lets another read redirect the reply.
 */
export async function replyToConversation(ticketId: string, message: string) {
  const conversations = posthog.conversations
  if (!conversations?.isAvailable()) throw new Error('Feedback cannot be reached from this browser right now.')
  if (conversations.getCurrentTicketId() !== ticketId) void conversations.getMessages(ticketId).catch(() => undefined)
  return conversations.sendMessage(message)
}

const TICKET_PAGE = 20
/** Bounds a read of one conversation at a thousand messages, twenty reads of fifty. */
const MAX_MESSAGE_PAGES = 20

export const TICKET_STATUS: Record<TicketStatus, string> = {
  new: 'Sent',
  open: 'Open',
  pending: 'Replied',
  on_hold: 'On hold',
  resolved: 'Resolved',
}

/** This browser's conversations, or this account's on every device once its identity is proven, a page at a time. */
export const supportTicketsQuery = (enabled: boolean) =>
  infiniteQueryOptions({
    queryKey: ticketsKey(),
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

/** The loaded conversations once each; a ticket that moved between pages since the last read would otherwise repeat. */
export const ticketsFrom = (data: InfiniteData<GetTicketsResponse> | undefined) => [
  ...new Map(data?.pages.flatMap((page) => page.results).map((ticket) => [ticket.id, ticket])).values(),
]

/** The messages a player can see in one conversation, which marks the team's replies read. */
export const supportMessagesQuery = (ticketId: string, enabled = true) =>
  queryOptions({
    queryKey: messagesKey(ticketId),
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
        void client.invalidateQueries({ queryKey: ticketsKey() })
      }
      return { status: first?.ticket_status, messages: messages.filter((message) => !message.is_private) }
    },
    enabled,
    refetchInterval: 10_000,
  })

/** A conversation's opening message, which never changes; reading it does not mark the team's replies read. */
export const openingMessageQuery = (ticketId: string) =>
  queryOptions({
    queryKey: [SUPPORT_KEY, 'opening', ticketId],
    queryFn: async () => (await posthog.conversations?.getMessages(ticketId))?.messages[0]?.content ?? null,
    staleTime: Infinity,
  })

/** This browser's or account's conversations, once Support answers in this browser. */
export function useSupportTickets() {
  const available = useSupportAvailable()
  const enabled = Boolean(available)
  const query = useInfiniteQuery(supportTicketsQuery(enabled))
  return { available, enabled, ...query, tickets: query.data ? ticketsFrom(query.data) : undefined, count: query.data?.pages[0]?.count }
}

/** How many of the team's replies the player has not read yet, across the conversations loaded so far. */
export const unreadReplies = (tickets: readonly { unread_count?: number }[] | undefined) =>
  tickets?.reduce((total, ticket) => total + (ticket.unread_count ?? 0), 0) ?? 0

/** Rereads the conversation list and every open conversation; opening messages never change, so they stay. */
export const refreshSupport = (client: QueryClient) =>
  Promise.all([client.invalidateQueries({ queryKey: ticketsKey() }), client.invalidateQueries({ queryKey: [SUPPORT_KEY, 'messages'] })])

/** The account this page last proved to Support; the SDK keeps the proof in memory, so a reload starts without one. */
let provenId: string | undefined

/**
 * Proves the signed-in account to Support so its conversations follow it across devices, and forgets the proof on sign-out,
 * which `posthog.reset()` keeps: a later guest on a shared device would otherwise read the account's conversations.
 */
export function SupportIdentity() {
  const { data: me } = useQuery(meQuery())
  const available = useSupportAvailable()
  const queryClient = useQueryClient()
  const { data: identity } = useQuery({
    queryKey: ['support-identity', me?.id],
    queryFn: () => supportIdentity(),
    enabled: Boolean(available && me),
    staleTime: Infinity,
  })
  const proven = me && identity?.distinctId === me.id ? identity : undefined
  useEffect(() => {
    // Both also forget the conversation the SDK has open, so each runs only on a change of account.
    if (proven && provenId !== proven.distinctId) posthog.setIdentity(proven.distinctId, proven.hash)
    else if (!me && provenId) posthog.clearIdentity()
    else return
    provenId = proven?.distinctId
    void refreshSupport(queryClient)
  }, [me, proven, queryClient])
  return null
}

/** What the support panel shows: the player's conversations, a new message, or one conversation. */
export type SupportView = { kind: 'inbox' } | { kind: 'compose' } | { kind: 'thread'; ticketId: string }

const OPEN_SUPPORT = 'praetorium-open-support'

/** Opens the support panel over the current page, so a message sent from it records what the player was looking at. */
export function openSupport(view: SupportView) {
  window.dispatchEvent(new CustomEvent<SupportView>(OPEN_SUPPORT, { detail: view }))
}

export const openFeedback = () => openSupport({ kind: 'compose' })
export const openConversations = () => openSupport({ kind: 'inbox' })
export const openConversation = (ticketId: string) => openSupport({ kind: 'thread', ticketId })

export function onOpenSupport(listener: (view: SupportView) => void) {
  const handle = (event: Event) => listener((event as CustomEvent<SupportView>).detail)
  window.addEventListener(OPEN_SUPPORT, handle)
  return () => window.removeEventListener(OPEN_SUPPORT, handle)
}
