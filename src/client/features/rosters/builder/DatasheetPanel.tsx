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
import { Keyword, KEYWORD_TAG_CLASS, UnitKeywords } from '../../../components/Keyword'
import { abilitySections, attachmentGroups, primaryUnitProfile, referenceAbilities, separateTransport } from '../../../datasheet'
import { RuleText } from '../../../components/RuleText'
import { ProfileRules } from '../ProfileRules'
import { ReminderButton, type ReminderControls } from '../ReminderButton'
import type { ReminderSubject } from '../../../../core/reminders'
import { Problem } from '../../../components/Problem'

type Props = {
  catalogueId: string
  entryId: string | null
  detachmentIds: readonly string[]
  picks: readonly RosterPick[]
  pickIndex: number | null
  embedded?: boolean
  hideSummary?: boolean
  providedSheet?: Datasheet | null
  onRelationshipSelect?: (entryId: string, name: string) => void
  /** `route` is undefined while the sheet loads and null when the datasheet has no reference page. */
  onReferenceRoute?: (reference: { entryId: string; route: Datasheet['referenceRoute'] | undefined } | null) => void
  abilityReminders?: ReminderControls
  detachmentRules?: readonly ReminderSubject[]
}

export function DatasheetPanel({
  catalogueId,
  entryId,
  detachmentIds,
  picks,
  pickIndex,
  embedded = false,
  hideSummary = false,
  providedSheet,
  onRelationshipSelect,
  onReferenceRoute,
  abilityReminders,
  detachmentRules,
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
  const referenceRoute = sheet ? sheet.referenceRoute : undefined

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
        <Problem className="max-w-52 text-center text-xs">This datasheet could not be loaded. Try again shortly.</Problem>
      </div>
    ) : (
      <DatasheetLoading />
    )
  }

  const model = primaryUnitProfile(sheet)
  const structured = datasheetProfilesByKind(sheet)
  const ranged = structured.ranged
  const melee = structured.melee
  const transport = separateTransport(sheet)
  const content = (
    <div data-slot="datasheet-content" className="w-full min-w-0 space-y-4">
      {!hideSummary && model ? <UnitProfile profile={model} /> : null}
      {!hideSummary && ranged.length ? <WeaponSummary title="Ranged weapons" weapons={ranged} rules={sheet.keywordRules} /> : null}
      {!hideSummary && melee.length ? <WeaponSummary title="Melee weapons" weapons={melee} rules={sheet.keywordRules} /> : null}
      <AbilitySummary
        abilities={referenceAbilities(sheet.abilities, sheet.attachments)}
        rules={sheet.keywordRules}
        reminders={abilityReminders}
        detachmentRules={detachmentRules}
      />
      <ProfileRules profiles={sheet.profiles} rules={sheet.keywordRules} compact />
      {transport ? (
        <section>
          <h2 className="rubric">Transport</h2>
          <div className="mt-2 border border-edge bg-card px-2 py-1.5">
            <RuleText text={transport} rules={sheet.keywordRules} />
          </div>
        </section>
      ) : null}
      {sheet.referenceRoute ? (
        <div className="border-t border-edge pt-3">
          <UnitKeywords className="min-w-0" sheet={sheet} />
        </div>
      ) : null}
      <RelationshipSummary sheet={sheet} onSelect={onRelationshipSelect} />
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
  reminders,
  detachmentRules,
}: {
  abilities: Datasheet['abilities']
  rules: Datasheet['keywordRules']
  reminders?: ReminderControls
  detachmentRules?: readonly ReminderSubject[]
}) {
  const sections = Object.entries(abilitySections).map(([kind, title]) => {
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
                {reminders ? <ReminderButton subject={ability} controls={reminders} /> : null}
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
                {reminders ? <ReminderButton subject={ability} controls={reminders} /> : null}
              </div>
              {ability.source ? <p className="eyebrow mt-1">{ability.name}</p> : null}
              {ability.description ? <RuleText text={ability.description} rules={rules} /> : null}
            </article>
          ))}
        </div>
      </section>
    )
  })
  if (!detachmentRules?.length) return sections
  const described = detachmentRules.flatMap((rule) => (rule.description ? [{ name: rule.name, description: rule.description }] : []))
  return sections.toSpliced(
    Object.keys(abilitySections).indexOf('faction') + 1,
    0,
    <section key="detachment">
      <h2 className="rubric">
        Detachment rules <span className="readout text-faint">{detachmentRules.length}</span>
      </h2>
      <div className="mt-2 flex flex-wrap gap-1">
        {detachmentRules.map((rule) => (
          <span key={rule.id} className="inline-flex items-center gap-0.5">
            <Keyword name={rule.name} rules={described} className={KEYWORD_TAG_CLASS} />
            {reminders ? <ReminderButton subject={rule} controls={reminders} /> : null}
          </span>
        ))}
      </div>
    </section>,
  )
}
