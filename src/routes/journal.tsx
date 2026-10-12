import { createFileRoute } from '@tanstack/react-router'
import { JournalPage } from '../client/features/journal/JournalPage'
import { factionIndexQuery, journalQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/journal')({
  loader: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(), staleTime: 'static' })
    if (!me) return
    await Promise.all([
      context.queryClient.query({ ...journalQuery(), staleTime: 'static' }),
      context.queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }),
    ])
  },
  component: JournalPage,
})
