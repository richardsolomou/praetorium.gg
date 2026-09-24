import { createFileRoute } from '@tanstack/react-router'
import { Terms } from '../client/features/legal/Terms'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: 'Terms of service — Praetorium' },
      { name: 'description', content: 'The terms that govern using praetorium.gg: accounts, acceptable use, your lists, and liability.' },
    ],
  }),
  component: Terms,
})
