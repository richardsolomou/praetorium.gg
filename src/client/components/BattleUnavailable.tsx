import { useQuery } from '@tanstack/react-query'
import { meQuery } from '../queries'
import { PageState } from './PageState'
import { SignInRequired } from './SignInRequired'

/**
 * What the link shows someone the battle is not open to.
 *
 * There is no seat to offer. A battle names everyone in it when it is created, so
 * following a link is either reading a battle you are in, watching one whose
 * players allow it, or this. Signing in is still worth offering, because a seated
 * player or a friend of one reaches this page whenever their session has lapsed,
 * and the alternative is telling them a battle they are in does not exist.
 */
export function BattleUnavailable({ token }: { token: string }) {
  const { data: me } = useQuery(meQuery())
  if (!me) {
    return (
      <SignInRequired
        title="Sign in to open this battle"
        explanation="If you are one of its players, or a friend they share their battles with, signing in will open it."
        next={`/battles/${token}`}
      />
    )
  }
  return (
    <main className="flex w-full">
      <PageState
        className="flex-1 border-x-0 border-t-0"
        eyebrow="Battle"
        title="This battle is not open to you"
        explanation="The players have limited who can watch this battle."
      />
    </main>
  )
}
