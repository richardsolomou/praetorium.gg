import { createFileRoute } from '@tanstack/react-router'
import { BattleSample } from '../client/features/battle/BattleSample'
import { armyReads } from '../client/features/battle/sideRules'
import { battleQuery, deploymentsQuery, gameReferencesQuery } from '../client/queries'
import { pageHead } from '../client/linkPreview'
import { SAMPLE_BATTLE_TOKEN } from '../contracts/battles'

export const Route = createFileRoute('/battles/sample')({
  loader: async ({ context }) => {
    const [screen] = await Promise.all([
      context.queryClient.query({ ...battleQuery(SAMPLE_BATTLE_TOKEN), staleTime: 'static' }),
      // The page reads these itself, so a failure shows there rather than failing the battle.
      context.queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' }).catch(() => undefined),
      context.queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => undefined),
    ])
    if (screen && screen.kind !== 'unavailable') await Promise.all(armyReads(context.queryClient, screen.view))
  },
  head: ({ match }) =>
    pageHead(match.context.origin, {
      title: 'Sample battle',
      description:
        'Look through a finished game tracked on Praetorium, with made-up players: its replay, command point log, what each mission card scored and the result.',
      path: '/battles/sample',
    }),
  component: BattleSample,
})
