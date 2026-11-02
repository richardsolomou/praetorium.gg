import { PageState } from '../../components/PageState'

export function RosterLoading() {
  return (
    <main className="flex w-full">
      <output className="flex flex-1">
        <PageState
          className="flex-1 rounded-none border-0"
          loading
          title="Loading your roster"
          explanation="Getting your army and points ready. This can take a moment the first time."
        />
      </output>
    </main>
  )
}
