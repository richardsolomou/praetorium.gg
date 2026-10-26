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
import { countLabel } from '../../text'
import { factionDisposition } from '../../components/rosterSetup'

export function SetupConsequences({ review, guest }: { review: Review; guest: boolean }) {
  const { source, candidate, before, after } = review
  const { data: sourceFaction } = useQuery(factionQuery(source.catalogueId))
  const { data: candidateFaction } = useQuery(factionQuery(candidate.catalogueId))
  const dispositionName = (faction: typeof sourceFaction, id: string | null | undefined) =>
    id ? (factionDisposition(faction, id)?.name ?? 'Unavailable disposition') : 'None'
  const detachmentBudget = (draft: Review['source']) =>
    enforces(draft.waivedRules, 'detachment-points') ? `${detachmentPointBudget(draft.limit) ?? 'No limit'} DP` : 'Waived'
  const waived = (draft: Review['source']) =>
    waivedFormatRules(draft.limit, draft.waivedRules, draft.pointsBudget)
      .map((rule) => rule.label)
      .join(', ') || 'None'
  const optional = (draft: Review['source']) =>
    pickedOptionalRules(draft.limit, draft.optionalRules ?? [])
      .map((rule) => rule.label)
      .join(', ') || 'None'
  const settings = [
    ['Faction', sourceFaction?.displayName ?? source.catalogueId, candidateFaction?.displayName ?? candidate.catalogueId],
    [
      'Rules version',
      rulesVersionLabel(sourceFaction ?? { edition: before.edition }),
      rulesVersionLabel(candidateFaction ?? { edition: after.edition }),
    ],
    ['Battle size', battleSizeName(source.limit), battleSizeName(candidate.limit)],
    ['Points limit', String(pointsBudgetOf(source)), String(pointsBudgetOf(candidate))],
    [
      'Detachment limit',
      String(detachmentLimit(source.limit, source.waivedRules)),
      String(detachmentLimit(candidate.limit, candidate.waivedRules)),
    ],
    ['Detachment budget', detachmentBudget(source), detachmentBudget(candidate)],
    ['Name', source.name || before.label, candidate.name || after.label],
    ['Visibility', source.visibility ?? 'private', candidate.visibility ?? 'private'],
    ['Force disposition', dispositionName(sourceFaction, before.disposition), dispositionName(candidateFaction, after.disposition)],
    ['Borrowed disposition', before.borrowedDetachment ?? 'None', after.borrowedDetachment ?? 'None'],
    ['Waived restrictions', waived(source), waived(candidate)],
    ['Optional rules', optional(source), optional(candidate)],
  ].filter(([, prior, next]) => prior !== next)
  const removedDetachments = before.detachments.filter((entry) => !after.detachments.some((next) => next.name === entry.name))
  const addedDetachments = after.detachments.filter((entry) => !before.detachments.some((prior) => prior.name === entry.name))
  const budget = pointsBudgetOf(candidate)
  const overBudget = after.points > budget && enforces(candidate.waivedRules, 'points-limit')
  const problems = [
    ...(overBudget ? [`Over budget by ${after.points - budget} points.`] : []),
    after.detachmentError,
    after.dispositionError,
    after.borrowedError,
    ...after.errors.map((entry) => `${entry.entryName}: ${entry.message}`),
  ].filter(Boolean)
  const keptUnits = new Map(after.units.map((unit) => [unit.key, unit]))
  const sourceUnits = new Map(before.units.map((unit) => [unit.key, unit]))
  const units = source.picks.map((prior, key) => {
    const unit = sourceUnits.get(key)
    const next = candidate.picks[key]
    const savedUnit = keptUnits.get(key)
    const removed =
      unit?.choices.flatMap((choice) => {
        const selected = prior.choices?.[choice.key]
        if (!selected || next?.choices?.[choice.key] === selected) return []
        return [choice.options.find((option) => option.id === selected)?.name ?? selected]
      }) ?? []
    const illegal = after.errors.some((error) => error.entryId === prior.entryId || error.entryName === unit?.name)
    const status = !next
      ? 'Removed'
      : illegal
        ? 'Illegal'
        : !unit || !savedUnit
          ? 'Needs review'
          : removed.length || savedUnit.points !== unit.points || savedUnit.size.models !== unit.size.models
            ? 'Changed'
            : 'Unchanged'
    const tone = !next || illegal || removed.length ? 'text-destructive' : status === 'Unchanged' ? 'text-dim' : 'text-discarded'
    const specials = [...(savedUnit?.enhancements ?? []), ...(savedUnit?.upgrades ?? [])]
    return {
      status,
      row: (
        <li key={unit?.key ?? `unavailable:${key}`} className={`border-l-2 pl-3 ${tone}`}>
          <div className="mb-1">
            <span className="chip text-current">{status}</span>
          </div>
          <p className="text-bone">
            {unit ? (
              <>
                {unit.name} · {countLabel(savedUnit?.size.models ?? unit.size.models, 'model')} ·{' '}
                <span className="readout">
                  {savedUnit && savedUnit.points !== unit.points ? `${unit.points} → ${savedUnit.points}` : unit.points} pts
                </span>
              </>
            ) : (
              `Unavailable entry ${prior.entryId}`
            )}
          </p>
          {removed.length ? <p className="mt-1">Removed choices: {removed.join(', ')}</p> : null}
          {specials.length ? <p className="mt-1 text-dim">Kept: {specials.join(', ')}</p> : null}
          {status === 'Needs review' ? <p className="mt-1">Its choices are preserved.</p> : null}
        </li>
      ),
    }
  })
  const changedUnits = units.filter((unit) => unit.status !== 'Unchanged')
  const unchangedUnits = units.filter((unit) => unit.status === 'Unchanged')
  const warnings = [...new Set(after.unhandled)]
  if (units.some((unit) => unit.status === 'Needs review')) warnings.push('Some units could not be checked.')

  return (
    <div className="space-y-5 text-sm" aria-label="Roster change preview">
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border border-edge bg-raised px-3 py-2 ${overBudget ? 'text-destructive' : ''}`}
      >
        <span className="readout text-lg">
          {after.points} / {budget} pts
        </span>
        {before.points !== after.points ? (
          <span className="readout">
            {after.points > before.points ? '+' : '−'}
            {Math.abs(after.points - before.points)} pts
          </span>
        ) : null}
      </div>
      {problems.length || warnings.length ? (
        <section aria-label="Needs attention" className="space-y-3 border border-discarded/40 bg-discarded/5 p-3">
          <h3 className="rubric text-discarded">Needs attention</h3>
          {problems.length ? (
            <ul className="space-y-1 text-destructive">
              {problems.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
          {warnings.length ? (
            <div className="text-discarded">
              <p className="font-semibold">Needs review</p>
              <ul className="mt-1 space-y-1">
                {warnings.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-dim">Illegal units stay in the roster for you to fix.</p>
        </section>
      ) : (
        <p className="text-achieved">No reported legality problems.</p>
      )}
      {settings.length ? (
        <section aria-label="Setup changes">
          <h3 className="rubric">Setup changes</h3>
          <dl className="mt-2 space-y-2">
            {settings.map(([label, prior, next]) => (
              <div key={label} className="grid gap-1 border-b border-edge pb-2 sm:grid-cols-[8rem_1fr]">
                <dt className="text-dim">{label}</dt>
                <dd className="min-w-0 break-words">
                  <span className="text-dim">{prior}</span>
                  {' → '}
                  <span className="text-discarded">{next}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {addedDetachments.length || removedDetachments.length ? (
        <section aria-label="Detachment changes">
          <h3 className="rubric">Detachment changes</h3>
          <ul className="mt-2 space-y-1">
            {addedDetachments.map((entry) => (
              <li key={`added:${entry.name}`} className="text-achieved">
                Added: {entry.name}
              </li>
            ))}
            {removedDetachments.map((entry) => (
              <li key={`removed:${entry.name}`} className="text-destructive">
                Removed: {entry.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {changedUnits.length ? (
        <section aria-label="Unit changes">
          <h3 className="rubric">Units and choices</h3>
          <ul className="mt-2 space-y-3">{changedUnits.map((unit) => unit.row)}</ul>
        </section>
      ) : null}
      {unchangedUnits.length ? (
        <details className="border-t border-edge pt-2">
          <summary className="min-h-11 cursor-pointer content-center text-dim hover:text-bone">
            {countLabel(unchangedUnits.length, 'unchanged unit')}
          </summary>
          <ul className="mt-2 space-y-3">{unchangedUnits.map((unit) => unit.row)}</ul>
        </details>
      ) : null}
      {!source.picks.length ? <p className="text-dim">No units selected.</p> : null}
      {guest ? (
        <p className="text-xs text-dim">This saves the draft in this browser. Avoid editing it in another tab while confirming.</p>
      ) : null}
    </div>
  )
}
