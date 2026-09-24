import { createFileRoute } from '@tanstack/react-router'
import { Support } from '../client/features/legal/Support'

export const Route = createFileRoute('/support')({
  head: () => ({
    meta: [
      { title: 'Support — Praetorium' },
      { name: 'description', content: 'Get help with the Praetorium web, iOS, and Android applications.' },
    ],
  }),
  component: Support,
})
