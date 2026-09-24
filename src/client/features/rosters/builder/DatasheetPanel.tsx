import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { datasheetProfilesByKind } from '../../../../core/datasheetStructure'
import type { RosterPick } from '../../../../core/roster'
import type { Datasheet, DatasheetRelationship } from '../../../../contracts/catalogue'
import { datasheetQuery } from '../../../queries'
import { useSettled } from '../../../useSettled'
import { UnitProfile, WeaponSummary } from '../../../components/DatasheetProfiles'
import { Keyword, KEYWORD_TAG_CLASS } from '../../../components/Keyword'
import { abilitySections, attachmentGroups, primaryUnitProfile, referenceAbilities } from '../../../datasheet'
import { RuleText } from '../../../components/RuleText'
import { ProfileRules } from '../ProfileRules'
import { ReminderButton, type ReminderControls } from '../ReminderButton'

type Props = {
  catalogueId: string
  entryId: string | null
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  showWeapons?: boolean
  embedded?: boolean
  hideSummary?: boolean
  providedSheet?: Datasheet | null
  showRelationships?: boolean
  onRelationshipSelect?: (entryId: string, name: string) => void
  onReferenceRoute?: (reference: { entryId: string; route: Datasheet['referenceRoute'] } | null) => void
  abilityReminders?: ReminderControls
}

export function DatasheetPanel({
  catalogueId,
  entryId,
  detachmentIds,
  picks,
  pickIndex,
  showWeapons = false,
  embedded = false,
  hideSummary = false,
  providedSheet,
  showRelationships = true,
  onRelationshipSelect,
  onReferenceRoute,
  abilityReminders,
}: Props) {
  // Only once the player stops changing the list, so a held stepper asks once.
  const detachments = useSettled(detachmentIds)
  const settledPicks = useSettled(picks)
  const settledIndex = useSettled(pickIndex)
  // A picker preview is not one of the roster's selections, so the server cannot
  // apply roster context to it. Do not put a roster it will discard in the URL.
  const contextualDetachments = settledIndex === null ? [] : detachments
  const contextualPicks = settledIndex === null ? [] : settledPicks
  const { data: fetchedSheet, isError } = useQuery({
    ...datasheetQuery(catalogueId, entryId ?? '', contextualDetachments, contextualPicks, settledIndex),
    enabled: providedSheet === undefined && Boolean(catalogueId && entryId),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === entryId ? previous : undefined),
  })
  const sheet = providedSheet === undefined ? fetchedSheet : providedSheet
  const referenceRoute = sheet?.referenceRoute ?? null

  useEffect(() => {
    onReferenceRoute?.(entryId ? { entryId, route: referenceRoute } : null)
    return () => onReferenceRoute?.(null)
  }, [entryId, onReferenceRoute, referenceRoute])

  if (!entryId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit to see its datasheet.</p>
      </div>
    )
  }
  if (!sheet) {
    return isError && providedSheet === undefined ? (
      <div className="flex h-full items-center justify-center p-6">
        <p role="alert" className="max-w-52 text-center text-xs text-destructive">
          This datasheet could not be loaded. Try again shortly.
        </p>
      </div>
    ) : (
      <DatasheetLoading />
    )
  }

  const model = primaryUnitProfile(sheet)
  const structured = datasheetProfilesByKind(sheet)
  const ranged = structured.ranged
  const melee = structured.melee
  const content = (
    <div data-slot="datasheet-content" className="w-full min-w-0 space-y-4">
      {!hideSummary && model ? <UnitProfile profile={model} /> : null}
      {!hideSummary && showWeapons && ranged.length ? (
        <WeaponSummary title="Ranged weapons" weapons={ranged} rules={sheet.keywordRules} />
      ) : null}
      {!hideSummary && showWeapons && melee.length ? (
        <WeaponSummary title="Melee weapons" weapons={melee} rules={sheet.keywordRules} />
      ) : null}
      <AbilitySummary
        abilities={referenceAbilities(sheet.abilities, sheet.attachments)}
        rules={sheet.keywordRules}
        unitName={sheet.name}
        reminders={abilityReminders}
      />
      <ProfileRules profiles={sheet.profiles} rules={sheet.keywordRules} compact />
      {sheet.referenceRoute ? (
        <div className="border-t border-edge pt-3">
          <div className="flex min-w-0 flex-wrap gap-1">
            {sheet.keywords.map((keyword) => (
              <Keyword key={keyword} name={keyword} rules={sheet.keywordRules} className={KEYWORD_TAG_CLASS} />
            ))}
          </div>
        </div>
      ) : null}
      {showRelationships ? <RelationshipSummary sheet={sheet} onSelect={onRelationshipSelect} /> : null}
    </div>
  )
  return embedded ? (
    <div className="border-t border-edge pt-4">{content}</div>
  ) : (
    <ScrollArea className="h-full min-w-0 max-w-full overflow-hidden [&_[data-slot=scroll-area-viewport]]:touch-pan-y [&_[data-slot=scroll-area-viewport]]:!overflow-x-hidden [&_[data-slot=scroll-area-viewport]]:overscroll-x-none [&_[data-slot=scroll-area-viewport]]:p-3">
      {content}
    </ScrollArea>
  )
}

function RelationshipSummary({
  sheet,
  onSelect,
}: {
  sheet: Pick<Datasheet, 'attachments' | 'leaders' | 'supporters'>
  onSelect?: (entryId: string, name: string) => void
}) {
  const groups = attachmentGroups(sheet)
  if (!groups.length) return null
  return (
    <section className="min-w-0 border-t border-edge pt-3">
      <h2 className="rubric">Attachments</h2>
      <div className="mt-2 space-y-2">
        {groups.map(({ title, relationships }) => (
          <div key={title} className="min-w-0">
            <h3 className="eyebrow mb-1.5">{title}</h3>
            <div className="flex w-full min-w-0 max-w-full flex-wrap gap-1">
              {relationships.map((relationship) => (
                <Relationship key={relationship.name} relationship={relationship} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Relationship({
  relationship,
  onSelect,
}: {
  relationship: DatasheetRelationship
  onSelect?: (entryId: string, name: string) => void
}) {
  const className = `${KEYWORD_TAG_CLASS} min-w-0 max-w-full whitespace-normal break-words text-left`
  if (!relationship.entryId || !onSelect) return <span className={className}>{relationship.name}</span>
  return (
    <button type="button" className={`${className} hover:text-bone`} onClick={() => onSelect(relationship.entryId!, relationship.name)}>
      {relationship.name}
    </button>
  )
}

/** Holds the pane's visual rhythm while a different datasheet is fetched. */
function DatasheetLoading() {
  return (
    <output className="block space-y-4 p-3" aria-label="Loading datasheet">
      <div className="flex gap-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-2 border-t border-edge pt-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-20" />
        </div>
      ))}
      <span className="sr-only">Loading datasheet…</span>
    </output>
  )
}

function AbilitySummary({
  abilities,
  rules,
  unitName,
  reminders,
}: {
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
  unitName: string
  reminders?: ReminderControls
}) {
  return Object.entries(abilitySections).map(([kind, title]) => {
    const found = abilities.filter((ability) => ability.kind === kind)
    if (!found.length) return null
    if (kind === 'core' || kind === 'faction') {
      const described = [
        ...found.flatMap((ability) => (ability.description ? [{ name: ability.name, description: ability.description }] : [])),
        ...rules,
      ]
      return (
        <section key={kind}>
          <h2 className="rubric">
            {title} <span className="readout text-faint">{found.length}</span>
          </h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {found.map((ability) => (
              <span key={ability.id} className="inline-flex items-center gap-0.5">
                <Keyword
                  name={ability.name}
                  rules={described}
                  className={
                    ability.source
                      ? 'chip inline-flex min-h-6 items-center justify-center border-info/50 bg-info/10 py-0.5 leading-none !text-info hover:!text-bone'
                      : KEYWORD_TAG_CLASS
                  }
                  note={ability.source ? `Added by ${ability.source}` : undefined}
                  highlightNote={false}
                />
                {reminders ? <ReminderButton subject={ability} unitName={unitName} controls={reminders} /> : null}
              </span>
            ))}
          </div>
        </section>
      )
    }
    return (
      <section key={kind}>
        <h2 className="rubric">
          {title} <span className="readout text-faint">{found.length}</span>
        </h2>
        <div className="mt-2 space-y-1.5">
          {found.map((ability) => (
            <article key={ability.id} className="relative border border-edge bg-card px-2 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xs">{ability.source ?? ability.name}</h3>
                {reminders ? <ReminderButton subject={ability} unitName={unitName} controls={reminders} /> : null}
              </div>
              {ability.source ? <p className="eyebrow mt-1">{ability.name}</p> : null}
              {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
            </article>
          ))}
        </div>
      </section>
    )
  })
}
