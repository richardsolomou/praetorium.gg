import { PageState } from '../../components/PageState'

export function RosterLoading() {
  return (
    <main className="w-full">
      <output className="block">
        <PageState
          className="border-x-0 border-t-0"
          loading
          eyebrow="Rosters"
          title="Loading your roster"
          explanation="Getting your army and points ready. This can take a moment the first time."
        />
      </output>
    </main>
  )
}
