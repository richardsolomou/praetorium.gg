import { useQuery } from '@tanstack/react-query'
import { factionQuery } from '../../queries'
import { rulesVersionLabel } from '../../../core/catalogueEdition'
import type { RosterSetupReview as Review } from './rosterSetupReview'
import {
  battleSizeName,
  detachmentLimit,
  detachmentPointBudget,
  enforces,
  pickedOptionalRules,
  pointsBudgetOf,
  waivedFormatRules,
} from '../../../core/battle'

export function SetupConsequences({ review, guest }: { review: Review; guest: boolean }) {
  const { source, candidate, before, after } = review
  const { data: sourceFaction } = useQuery(factionQuery(source.catalogueId))
  const { data: candidateFaction } = useQuery(factionQuery(candidate.catalogueId))
  const dispositionName = (faction: typeof sourceFaction, id: string | null | undefined) =>
    id
      ? (faction?.detachments.flatMap((entry) => entry.dispositions).find((entry) => entry.id === id)?.name ?? 'Unavailable disposition')
      : 'None'
  const removedDetachments = before.detachments.filter((entry) => !after.detachments.some((next) => next.name === entry.name))
  const keptUnits = new Map(after.units.map((unit) => [unit.key, unit]))
  const budget = pointsBudgetOf(candidate)
  const sourceEntries = source.picks.map((pick, key) => ({ pick, key, unit: before.units.find((entry) => entry.key === key) }))
  return (
    <div className="space-y-5" aria-label="Roster change preview">
      <p className="text-sm text-dim">Review the exact roster that will be saved. Units that become illegal remain available to fix.</p>
      <p className="text-sm">
        Rules: {rulesVersionLabel(sourceFaction ?? { edition: before.edition })} →{' '}
        {rulesVersionLabel(candidateFaction ?? { edition: after.edition })}
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt>Points</dt>
        <dd className="readout">
          {before.points} → {after.points}
        </dd>
        <dt>Battle size</dt>
        <dd>
          {battleSizeName(source.limit)} → {battleSizeName(candidate.limit)}
        </dd>
        <dt>Points limit</dt>
        <dd className="readout">
          {pointsBudgetOf(source)} → {budget}
        </dd>
        <dt>Detachment limit</dt>
        <dd>
          {detachmentLimit(source.limit, source.waivedRules)} → {detachmentLimit(candidate.limit, candidate.waivedRules)}
        </dd>
        <dt>Detachment budget</dt>
        <dd>
          {enforces(candidate.waivedRules, 'detachment-points') ? `${detachmentPointBudget(candidate.limit) ?? 'No limit'} DP` : 'Waived'}
        </dd>
        <dt>Name</dt>
        <dd>{candidate.name || after.label}</dd>
        <dt>Visibility</dt>
        <dd className="capitalize">{candidate.visibility}</dd>
        <dt>Force disposition</dt>
        <dd>
          {dispositionName(sourceFaction, before.disposition)} → {dispositionName(candidateFaction, after.disposition)}
        </dd>
        {before.borrowedDetachment || after.borrowedDetachment ? (
          <>
            <dt>Borrowed disposition</dt>
            <dd>
              {before.borrowedDetachment ?? 'None'} → {after.borrowedDetachment ?? 'None'}
            </dd>
          </>
        ) : null}
      </dl>
      <p className="text-sm">
        Waived restrictions:{' '}
        {waivedFormatRules(candidate.limit, candidate.waivedRules, candidate.pointsBudget)
          .map((rule) => rule.label)
          .join(', ') || 'None'}
        .
      </p>
      <p className="text-sm">
        Optional rules:{' '}
        {pickedOptionalRules(source.limit, source.optionalRules ?? [])
          .map((rule) => rule.label)
          .join(', ') || 'None'}{' '}
        →{' '}
        {pickedOptionalRules(candidate.limit, candidate.optionalRules ?? [])
          .map((rule) => rule.label)
          .join(', ') || 'None'}
        .
      </p>
      <section>
        <h3 className="rubric">Detachments</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {after.detachments.map((entry) => (
            <li key={entry.name}>
              {before.detachments.some((prior) => prior.name === entry.name) ? 'Preserved' : 'Added'}: {entry.name}
            </li>
          ))}
          {removedDetachments.map((entry) => (
            <li key={entry.name} className="text-discarded">
              Removed: {entry.name}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="rubric">Units and choices</h3>
        <ul className="mt-2 space-y-3 text-sm">
          {sourceEntries.map(({ pick: prior, key, unit }) => {
            if (!unit)
              return (
                <li key={key} className="text-discarded">
                  Needs review: unavailable entry {prior.entryId}.{' '}
                  {candidate.picks[key] ? 'Its choices are preserved.' : 'It will be removed.'}
                </li>
              )
            const next = candidate.picks[unit.key]
            const removed = unit.choices.flatMap((choice) => {
              const selected = prior?.choices?.[choice.key]
              if (!selected || next?.choices?.[choice.key] === selected) return []
              return [choice.options.find((option) => option.id === selected)?.name ?? selected]
            })
            const savedUnit = keptUnits.get(unit.key)
            const illegal = after.errors.some((error) => error.entryId === prior.entryId || error.entryName === unit.name)
            const specials = [...(savedUnit?.enhancements ?? []), ...(savedUnit?.upgrades ?? [])]
            return (
              <li key={unit.key}>
                <p>
                  {!next ? 'Removed' : illegal ? 'Illegal' : !savedUnit ? 'Needs review' : 'Preserved'}: {unit.name} · {unit.size.models}{' '}
                  {unit.size.models === 1 ? 'model' : 'models'}
                </p>
                {specials.length ? <p>Preserved choices: {specials.join(', ')}</p> : null}
                {removed.length ? <p className="text-discarded">Removed choices: {removed.join(', ')}</p> : null}
              </li>
            )
          })}
          {!source.picks.length ? <li>No units selected.</li> : null}
        </ul>
      </section>
      <section>
        <h3 className="rubric">Legality under the selected rules</h3>
        {after.points > budget && enforces(candidate.waivedRules, 'points-limit') ? (
          <p className="mt-2 text-sm text-destructive">Over budget by {after.points - budget} points.</p>
        ) : null}
        <ul className="mt-2 space-y-1 text-sm text-destructive">
          {[
            after.detachmentError,
            after.dispositionError,
            after.borrowedError,
            ...after.errors.map((entry) => `${entry.entryName}: ${entry.message}`),
          ]
            .filter(Boolean)
            .map((message) => (
              <li key={message}>{message}</li>
            ))}
        </ul>
        {after.unhandled.length ? (
          <>
            <p className="mt-2 text-sm text-discarded">Needs review:</p>
            <ul className="text-sm text-discarded">
              {[...new Set(after.unhandled)].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </>
        ) : null}
        {!after.errors.length &&
        !after.unhandled.length &&
        !after.detachmentError &&
        !after.dispositionError &&
        !after.borrowedError &&
        (after.points <= budget || !enforces(candidate.waivedRules, 'points-limit')) ? (
          <p className="mt-2 text-sm">No reported legality problems.</p>
        ) : null}
        <p className="mt-2 text-xs text-dim">
          The selected rules version supplies the construction restrictions. Waived and optional rules remain part of this roster.
        </p>
      </section>
      {guest ? (
        <p className="text-xs text-dim">
          This saves the draft in this browser. Avoid editing it in another tab while confirming; browser draft writes are not atomic across
          tabs.
        </p>
      ) : null}
    </div>
  )
}
