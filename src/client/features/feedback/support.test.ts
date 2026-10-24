import { posthog } from 'posthog-js'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { replyToConversation, supportMessagesQuery } from './support'

vi.mock('../../functions', () => ({ supportIdentity: vi.fn() }))

const original = posthog.conversations
afterEach(() => {
  ;(posthog as unknown as { conversations: unknown }).conversations = original
})

it('sends a reply to its own conversation even when another one is read before the send', async () => {
  // As the SDK does: reading a conversation makes it the one the next message goes to, at once.
  let current = 'other'
  const sentTo: string[] = []
  const conversations = {
    isAvailable: () => true,
    getCurrentTicketId: () => current,
    getMessages: (ticketId: string) => {
      current = ticketId
      return new Promise((resolve) => setTimeout(resolve, 10))
    },
    sendMessage: async () => {
      sentTo.push(current)
    },
  }
  ;(posthog as unknown as { conversations: unknown }).conversations = conversations

  const reply = replyToConversation('mine', 'Thanks!')
  // A conversation list row reads its opening message while the reply is on its way.
  void conversations.getMessages('other')
  await reply

  expect(sentTo).toEqual(['mine'])
})

it('reads a long conversation to its newest message, a page at a time', async () => {
  const messages = Array.from({ length: 120 }, (_, index) => ({
    id: `m${index}`,
    content: `Message ${index}`,
    author_type: index % 2 ? 'human' : 'customer',
    created_at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
    is_private: false,
  }))
  // As the API does: fifty at a time, oldest first, from just after the given moment.
  const getMessages = async (ticketId: string, after?: string) => {
    const rest = after ? messages.filter((message) => message.created_at > after) : messages
    return { ticket_id: ticketId, ticket_status: 'open', messages: rest.slice(0, 50), has_more: rest.length > 50, unread_count: 0 }
  }
  ;(posthog as unknown as { conversations: unknown }).conversations = { getMessages }

  const read = await new QueryClient().query(supportMessagesQuery('ticket'))

  expect(read.messages.map((message) => message.id)).toEqual(messages.map((message) => message.id))
})
