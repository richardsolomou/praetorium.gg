import { Link } from '@tanstack/react-router'
import type { Roster } from '../../core/battle'

export function BattleRosterSnapshot({ roster, token }: { roster: Roster; token: string }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-4 sm:py-7">
      <Link to="/battles/$token" params={{ token }} className="eyebrow text-info">
        Back to battle
      </Link>
      <div className="mt-4 border border-edge bg-panel p-4 sm:p-5">
        <p className="eyebrow text-parchment">Fielded roster snapshot</p>
        <h1 className="mt-1 text-3xl">{roster.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-dim">
          This is the roster recorded when it was attached to this battle. Later edits or deletion of the saved roster do not change it.
        </p>
        <pre className="mt-5 overflow-auto whitespace-pre-wrap border border-edge bg-sunken p-3 font-rules text-sm select-text">
          {roster.text}
        </pre>
      </div>
    </main>
  )
}
