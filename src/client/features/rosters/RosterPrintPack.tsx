import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { attachedUnitList } from '../../../core/attachedUnits'
import { ATTACHMENT_LABELS } from '../../../core/attachmentRows'
import { rulesVersionLabel } from '../../../core/catalogueEdition'
import { datasheetProfilesByKind } from '../../../core/datasheetStructure'
import type { RosterPick } from '../../../core/roster'
import { stratagemTiming } from '../../../core/reminders'
import { nicknamedUnit } from '../../../core/unitNotes'
import type { FormatRuleId, OptionalRuleId } from '../../../core/battle'
import { pickedOptionalRules, pointsBudgetOf, waivedFormatRules } from '../../../core/battle'
import { factionQuery, detachmentDetailQuery, detachmentRulesQuery, loadoutDatasheetsQuery, priceQuery } from '../../queries'
import type { priceRoster } from '../../functions'
import { RuleText } from '../../components/RuleText'
import { UnitProfile } from '../../components/DatasheetProfiles'
import { primaryUnitProfile } from '../../datasheet'
import { Loadout } from './builder/Loadout'
import { ProfileRules } from './ProfileRules'
import { normalisePicks } from './rosterPicks'
import { countLabel } from '../../text'
import { unitKeywordsText } from '../../components/Keyword'
import { usePrintWhenReady } from './usePrintWhenReady'
import { chunks } from '../../../core/collections'
import { hasWarlordToggle } from '../../../core/unitChoices'
import { factionDisposition } from '../../components/rosterSetup'

type Price = NonNullable<Awaited<ReturnType<typeof priceRoster>>>

export type RosterPrintInput = {
  name: string
  url: string | null
  draft: boolean
  catalogueId: string
  detachmentIds: string[]
  limit: number
  pointsBudget: number | null
  picks: RosterPick[]
  price: Price
  waivedRules: FormatRuleId[]
  optionalRules: OptionalRuleId[]
  borrowedDetachmentId: string | null
}

export function RosterPrintPack({ input, onClose }: { input: RosterPrintInput; onClose: () => void }) {
  const client = useQueryClient()
  const picks = useMemo(() => normalisePicks(input.picks), [input.picks])
  const title = (unit: { key: number; name: string }) => nicknamedUnit(unit.name, input.picks[unit.key]?.nickname)
  const { data, isError, refetch } = useQuery({
    queryKey: ['roster-print-pack', input],
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const faction = await client.query({ ...factionQuery(input.catalogueId), staleTime: 0 })
      if (!faction) throw new Error('The army reference is unavailable.')
      const selected = input.detachmentIds.map((id) => faction.detachments.find((detachment) => detachment.id === id))
      if (selected.some((detachment) => !detachment)) throw new Error('A selected detachment reference is unavailable.')
      const detachments = []
      for (const detachment of selected) {
        signal.throwIfAborted()
        const detail = await client.query({ ...detachmentDetailQuery(input.catalogueId, detachment!.slug), staleTime: 0 })
        if (!detail) throw new Error('A selected detachment reference is unavailable.')
        detachments.push(detail)
      }
      const cards = await client.query({
        ...detachmentRulesQuery(
          input.catalogueId,
          input.price.detachments.map((detachment) => detachment.name),
        ),
        staleTime: 0,
      })
      if (!cards) throw new Error('The stratagem reference is unavailable.')
      const units = []
      // A full army's contextual reads are expensive; keep at most three in flight.
      for (const chunk of chunks(input.price.units, 3)) {
        signal.throwIfAborted()
        const batch = await Promise.all(
          chunk.map(async (unit) => {
            const pick = input.picks[unit.key]
            const sheets = await client.query({
              ...loadoutDatasheetsQuery(pick?.catalogueId ?? input.catalogueId, unit.entryId, input.detachmentIds, picks, unit.key),
              staleTime: 0,
            })
            if (!sheets?.selected || !sheets.available) throw new Error(`The reference for ${unit.name} is unavailable.`)
            return { ...unit, attachedTo: pick?.attachedTo, sheets }
          }),
        )
        units.push(...batch)
      }
      if (units.length !== input.picks.length)
        throw new Error('Some roster selections could not be built. Review the roster before printing.')
      signal.throwIfAborted()
      const checked = await client.query({
        ...priceQuery(
          input.catalogueId,
          input.detachmentIds,
          input.price.disposition ?? null,
          input.limit,
          picks,
          input.waivedRules,
          input.borrowedDetachmentId,
          input.optionalRules,
        ),
        staleTime: 0,
      })
      if (!checked || checked.revision !== input.price.revision || checked.points !== input.price.points)
        throw new Error('The army data changed while preparing the pack. Return to the roster and print again.')
      return { faction, detachments, cards, groups: attachedUnitList(units) }
    },
  })

  usePrintWhenReady(Boolean(data))

  if (!data)
    return (
      <div className="space-y-3 p-4" data-print-hide>
        <p role={isError ? 'alert' : 'status'}>
          {isError
            ? 'The complete battle reference pack could not be prepared. Retry or return to your roster.'
            : 'Preparing battle reference pack…'}
        </p>
        {isError ? (
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        ) : null}
        <Button variant="outline" onClick={onClose}>
          Return to roster
        </Button>
      </div>
    )

  const stratagems = [...data.cards.core, ...data.cards.stratagems]
  const referencedRules = [
    ...new Map(
      [
        ...data.groups.flatMap(({ host, joined }) =>
          [host, ...joined].flatMap((unit) => [
            ...unit.sheets.selected!.keywordRules,
            ...unit.sheets.selected!.abilities.flatMap((ability) =>
              (ability.kind === 'core' || ability.kind === 'faction') && ability.description
                ? [{ name: ability.name, description: ability.description }]
                : [],
            ),
          ]),
        ),
        ...data.cards.keywordRules,
        ...data.detachments.flatMap((detachment) => detachment.keywordRules),
      ].map((rule) => [`${rule.name}\0${rule.description}`, rule]),
    ).values(),
  ]
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-roster-print-screen>
      <div className="flex gap-2 p-3" data-print-hide>
        <Button variant="outline" onClick={onClose}>
          Return to roster
        </Button>
        <Button onClick={() => window.print()}>Print battle reference pack</Button>
      </div>
      <div data-battle-reference-pack>
        <header>
          <p>Battle reference pack</p>
          <h1>{input.name || 'Roster'}</h1>
          <p>
            {data.faction.displayName} · {input.price.points}/{pointsBudgetOf(input)} points · {countLabel(data.groups.length, 'unit')} ·{' '}
            {countLabel(
              input.price.units.reduce((count, unit) => count + unit.size.models, 0),
              'model',
            )}
          </p>
          <p>Rules version: {rulesVersionLabel({ ...data.faction, edition: input.price.edition ?? data.faction.edition })}</p>
          <p>
            Points and selected equipment from catalogue revision: <span className="break-all">{input.price.revision}</span>
          </p>
          {data.cards.dataslate ? <p>{data.cards.dataslate}</p> : null}
          <p>
            {input.draft ? 'Draft on this device' : 'Roster'}
            {input.url ? (
              <>
                {' '}
                · <a href={input.url}>{input.url}</a>
              </>
            ) : null}
          </p>
          <p>
            {input.url ? 'The link retains the roster’s existing access restrictions.' : 'Save this draft for a roster link.'} This pack
            records the army at printing time; reference data can change.
          </p>
          {input.price.errors.length ? <p>Resolve roster validation messages before playing this list.</p> : null}
          {input.price.points > pointsBudgetOf(input) ? <p>Over the points limit.</p> : null}
          {input.price.unhandled.length ? <p>Some restrictions could not be checked. Read the source rules before playing.</p> : null}
          {waivedFormatRules(input.limit, input.waivedRules, input.pointsBudget).map((rule) => (
            <p key={rule.id}>Waived rule: {rule.label}</p>
          ))}
          {pickedOptionalRules(input.limit, input.optionalRules).map((rule) => (
            <p key={rule.id}>Optional rule: {rule.label}</p>
          ))}
          {input.price.borrowedDetachment ? (
            <p>Borrowed disposition from {input.price.borrowedDetachment}; its detachment rules are not included.</p>
          ) : null}
        </header>
        <section>
          <h2>Army summary</h2>
          <p>
            {input.price.detachments
              .map((detachment) => `${detachment.name}${detachment.points === null ? '' : ` (${detachment.points} DP)`}`)
              .join(' · ')}
          </p>
          {input.price.disposition ? (
            <p>Force disposition: {factionDisposition(data.faction, input.price.disposition)?.name ?? input.price.disposition}</p>
          ) : null}
          <ol>
            {data.groups.map(({ host, joined }, index) => (
              <li key={host.key}>
                <a href={`#pack-unit-${host.key}`}>
                  Unit {index + 1}:{' '}
                  {[host, ...joined]
                    .map(
                      (unit) =>
                        `${title(unit)} (${countLabel(unit.size.models, 'model')}, ${unit.points} pts)${hasWarlordToggle(unit.toggles) ? ', Warlord' : ''}`,
                    )
                    .join(' + ')}
                </a>
              </li>
            ))}
          </ol>
        </section>
        {data.groups.map(({ host, joined }, index) => (
          <section className="pack-unit" id={`pack-unit-${host.key}`} key={host.key} data-print-unit={host.name}>
            <h2>
              Unit {index + 1}: {title(host)}
              {joined.length ? ` + ${joined.map(title).join(' + ')}` : ''}
            </h2>
            {[host, ...joined].map((unit) => (
              <div key={unit.key} data-print-datasheet={unit.name}>
                <h3>
                  {title(unit)} · {countLabel(unit.size.models, 'model')} · {unit.points} pts
                  {hasWarlordToggle(unit.toggles) ? ' · Warlord' : ''}
                </h3>
                {input.picks[unit.key]?.note ? (
                  <p className="ph-no-capture whitespace-pre-line" data-print-note>
                    Note: {input.picks[unit.key]?.note}
                  </p>
                ) : null}
                {unit !== host ? (
                  <p>
                    {ATTACHMENT_LABELS[unit.attachment?.kind ?? 'support'].joining} {title(host)} (Unit {index + 1})
                  </p>
                ) : null}
                <p>
                  Selected equipment: {unit.wargear.map((piece) => `${piece.count}× ${piece.name}`).join(', ') || 'No equipment recorded.'}
                </p>
                <div data-print-loadout>
                  <Loadout
                    catalogueId={input.picks[unit.key]?.catalogueId ?? input.catalogueId}
                    unit={unit}
                    detachmentIds={input.detachmentIds}
                    picks={picks}
                    pickIndex={unit.key}
                    editable={false}
                    embedded
                    showOptions={false}
                    onChoose={noop}
                    onSpread={noop}
                    providedSheets={unit.sheets}
                  />
                </div>
                {datasheetProfilesByKind(unit.sheets.selected!)
                  .unit.filter((profile) => profile.id !== primaryUnitProfile(unit.sheets.selected!)?.id)
                  .map((profile) => (
                    <section className="pack-rule" key={profile.id}>
                      <h4>{profile.name}</h4>
                      <UnitProfile profile={profile} />
                    </section>
                  ))}
                {unit.sheets
                  .selected!.abilities.filter((ability) => ability.kind !== 'core' && ability.kind !== 'faction')
                  .map((ability) => (
                    <section className="pack-rule" key={ability.id}>
                      <h4>
                        {ability.name}
                        {ability.source ? ` (${ability.source})` : ''}
                      </h4>
                      {ability.description ? <RuleText text={ability.description} /> : <p>No description is available.</p>}
                    </section>
                  ))}
                {unit.sheets.selected!.abilities.some((ability) => ability.kind === 'core' || ability.kind === 'faction') ? (
                  <p>
                    Referenced abilities:{' '}
                    {unit.sheets
                      .selected!.abilities.filter((ability) => ability.kind === 'core' || ability.kind === 'faction')
                      .map((ability) => ability.name)
                      .join(', ')}
                    . See referenced abilities and weapon rules.
                  </p>
                ) : null}
                <ProfileRules profiles={unit.sheets.selected!.profiles} rules={[]} compact />
                <p>Keywords: {unitKeywordsText(unit.sheets.selected!)}</p>
              </div>
            ))}
          </section>
        ))}
        <section className="pack-section">
          <h2>Army rules</h2>
          {data.faction.armyRules.length ? (
            data.faction.armyRules.map((rule) => (
              <section className="pack-rule" key={rule.name}>
                <h3>{rule.name}</h3>
                <RuleText text={rule.description} />
              </section>
            ))
          ) : (
            <p>No army rule description is available.</p>
          )}
          {data.detachments.map((detachment) => (
            <section className="pack-rule" key={detachment.name}>
              <h2>{detachment.name}: detachment rules</h2>
              {detachment.rules.length ? (
                detachment.rules.map((rule) => (
                  <section className="pack-rule" key={rule.name}>
                    <h3>{rule.name}</h3>
                    {rule.description ? <RuleText text={rule.description} /> : <p>No description is available.</p>}
                  </section>
                ))
              ) : (
                <p>No detachment rule description is available.</p>
              )}
            </section>
          ))}
        </section>
        <section className="pack-section">
          <h2>Core and detachment stratagems</h2>
          {stratagems.map((stratagem) => {
            const written = data.cards.written.find((card) => card.key === stratagem.key)
            return (
              <section className="pack-rule" key={stratagem.key}>
                <h3>
                  {stratagem.name} · {stratagem.cp} CP
                </h3>
                <p>{[stratagem.detachment, written?.type, ...stratagemTiming(stratagem)].filter(Boolean).join(' · ')}</p>
                {written?.description ? <RuleText text={written.description} /> : <p>No description is available.</p>}
              </section>
            )
          })}
        </section>
        <section className="pack-section">
          <h2>Referenced abilities and weapon rules</h2>
          {referencedRules.map((rule) => (
            <section className="pack-rule" key={`${rule.name}\0${rule.description}`}>
              <h3>{rule.name}</h3>
              <RuleText text={rule.description} />
            </section>
          ))}
        </section>
        {/* A printed pack leaves the app and its sources page, so it names where its words and prices came from. */}
        <p>Rules text from BSData and Game Datacards; prices from the BSData Munitorum Field Manual. Data sources: praetorium.gg/sources</p>
      </div>
    </div>
  )
}

const noop = () => {}
