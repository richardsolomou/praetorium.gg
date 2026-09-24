import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPolicy } from '../client/features/legal/PrivacyPolicy'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy policy — Praetorium' },
      { name: 'description', content: 'What Praetorium collects, who can see your lists and battles, and how to have it deleted.' },
    ],
  }),
  component: PrivacyPolicy,
})
