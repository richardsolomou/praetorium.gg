import { FullPageState } from '../../components/PageState'

/** What a link shows for a battle nobody is seated at; every other battle is open to watch. */
export function BattleUnavailable() {
  return (
    <FullPageState
      eyebrow="Battle"
      title="This battle is not open"
      explanation="Nobody is seated at this battle, so there is nothing to watch."
    />
  )
}
