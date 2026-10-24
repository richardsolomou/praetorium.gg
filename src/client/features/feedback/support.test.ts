import { posthog } from 'posthog-js'
import { afterEach, expect, it, vi } from 'vitest'
import { replyToConversation } from './support'

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
