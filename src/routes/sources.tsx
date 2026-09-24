import { createFileRoute } from '@tanstack/react-router'
import { Sources } from '../client/features/legal/Sources'

export const Route = createFileRoute('/sources')({
  head: () => ({
    meta: [
      { title: 'Data sources — Praetorium' },
      { name: 'description', content: 'The community data sources, licences, attribution, and trademark notice for Praetorium.' },
    ],
  }),
  component: Sources,
})
