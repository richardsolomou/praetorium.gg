import { type InfiniteData, type QueryClient, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GetTicketsResponse, TicketStatus } from 'posthog-js'
import { posthog } from 'posthog-js'
import { useEffect, useSyncExternalStore } from 'react'
import { supportIdentity } from '../../functions'
import { meQuery, supportIdentityKey, supportKey, supportMessagesKey, supportTicketsKey, supportTicketsQuery } from '../../queries'

// A local dev server never loads PostHog, so it gets a stand-in with conversations to read; builds drop this.
if (import.meta.env.MODE === 'development' && typeof window !== 'undefined') {
  void import('./devSupport').then(({ installDevSupport }) => installDevSupport())
}

const CHECK_MS = 500
// Support loads after the SDK fetches its remote config; a blocked SDK never says it has given up.
const GIVE_UP_MS = 15_000

let supportAvailable: boolean | undefined
const watchers = new Set<() => void>()
let polling: number | undefined

/** Polls the SDK once for every component that asks, until it answers or the wait runs out. */
function watchSupport(onChange: () => void) {
  watchers.add(onChange)
  if (supportAvailable === undefined && polling === undefined) {
    const started = Date.now()
    const check = () => {
      if (posthog.conversations?.isAvailable()) supportAvailable = true
      else if (Date.now() - started > GIVE_UP_MS) supportAvailable = false
      else return
      window.clearInterval(polling)
      polling = undefined
      for (const watcher of watchers) watcher()
    }
    polling = window.setInterval(check, CHECK_MS)
    check()
  }
  return () => {
    watchers.delete(onChange)
    if (watchers.size || polling === undefined) return
    window.clearInterval(polling)
    polling = undefined
  }
}

/** Whether PostHog Support answers in this browser: undefined while the SDK may still load it. */
export const useSupportAvailable = () =>
  useSyncExternalStore(
    watchSupport,
    () => supportAvailable,
    () => undefined,
  )

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

export const TICKET_STATUS: Record<TicketStatus, string> = {
  new: 'Sent',
  open: 'Open',
  pending: 'Replied',
  on_hold: 'On hold',
  resolved: 'Resolved',
}

/** The loaded conversations once each; a ticket that moved between pages since the last read would otherwise repeat. */
const ticketsFrom = (data: InfiniteData<GetTicketsResponse> | undefined) => [
  ...new Map(data?.pages.flatMap((page) => page.results).map((ticket) => [ticket.id, ticket])).values(),
]

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
  Promise.all([client.invalidateQueries({ queryKey: supportTicketsKey() }), client.invalidateQueries({ queryKey: supportMessagesKey() })])

/**
 * Reads everything again as whoever Support now knows the player as. A reset, not a refresh: a refresh joins a read
 * still in flight, which started before the identity changed and would show the previous reader's conversations.
 */
export const readAsNewIdentity = (client: QueryClient) => client.resetQueries({ queryKey: supportKey() })

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
    queryKey: supportIdentityKey(me?.id),
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
    void readAsNewIdentity(queryClient)
  }, [me, proven, queryClient])
  return null
}

/** What the support panel shows: the player's conversations, a new message, or one conversation. */
export type SupportView = { kind: 'inbox' } | { kind: 'compose' } | { kind: 'thread'; ticketId: string }

const listeners = new Set<(view: SupportView) => void>()
/** A request made before the panel listens, as a link opening a conversation on a fresh page load is. */
let waiting: SupportView | undefined

/** Opens the support panel over the current page, so a message sent from it records what the player was looking at. */
function openSupport(view: SupportView) {
  if (!listeners.size) waiting = view
  for (const listener of listeners) listener(view)
}

export const openFeedback = () => openSupport({ kind: 'compose' })
export const openConversations = () => openSupport({ kind: 'inbox' })
export const openConversation = (ticketId: string) => openSupport({ kind: 'thread', ticketId })

export function onOpenSupport(listener: (view: SupportView) => void) {
  listeners.add(listener)
  if (waiting) listener(waiting)
  waiting = undefined
  return () => {
    listeners.delete(listener)
  }
}
