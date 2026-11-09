import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { attachedUnitList } from '../../../core/attachedUnits'
import { ATTACHMENT_LABELS } from '../../../core/attachmentRows'
import { rulesVersionLabel } from '../../../core/catalogueEdition'
import type { RosterPick } from '../../../core/roster'
import { stratagemTiming } from '../../../core/reminders'
import { nicknamedUnit } from '../../../core/unitNotes'
import type { FormatRuleId, OptionalRuleId } from '../../../core/battle'
import { pickedOptionalRules, pointsBudgetOf, waivedFormatRules } from '../../../core/battle'
import { factionQuery, detachmentDetailQuery, detachmentRulesQuery, loadoutDatasheetsQuery, priceQuery } from '../../queries'
import type { priceRoster } from '../../functions'
import { RuleText } from '../../components/RuleText'
import { openTextSourcesDialog } from '../../components/TextSourcesDialog'
import { loadedText, retryFailedTextFiles, useSourceTexts } from '../../sourceText'
import { hasTextTokens } from '../../../shared/sourceText'
import type { TextSourceChoice } from '../../rulesText'
import { ruleProfileSections, weaponShapedProfile } from '../../datasheet'
import { PRINTED_RULE, RosterPrintDatasheet } from './RosterPrintDatasheet'
import { normalisePicks } from './rosterPicks'
import { countLabel } from '../../text'
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

  type Pack = NonNullable<typeof data>
  const referencedRulesOf = (pack: Pack) => {
    return [
      ...new Map(
        [
          ...pack.groups.flatMap(({ host, joined }) =>
            [host, ...joined].flatMap((unit) => [
              ...unit.sheets.selected!.keywordRules,
              ...unit.sheets.selected!.abilities.flatMap((ability) =>
                (ability.kind === 'core' || ability.kind === 'faction') && ability.description
                  ? [{ name: ability.name, description: ability.description }]
                  : [],
              ),
            ]),
          ),
          ...pack.cards.keywordRules,
          ...pack.detachments.flatMap((detachment) => detachment.keywordRules),
        ].map((rule) => [`${rule.name}\0${rule.description}`, rule]),
      ).values(),
    ]
  }
  // Every rules text the pack draws, so printing can wait until the device has loaded each one.
  const printedTexts = (pack: Pack) => [
    ...pack.groups.flatMap(({ host, joined }) =>
      [host, ...joined].flatMap(({ sheets }) => [
        ...sheets.selected!.abilities.flatMap((ability) =>
          ability.kind !== 'core' && ability.kind !== 'faction' && ability.description ? [ability.description] : [],
        ),
        ...ruleProfileSections(sheets.selected!.profiles).flatMap((section) =>
          section.profiles.flatMap((profile) => (weaponShapedProfile(profile) ? [] : profile.values.map((value) => value.value))),
        ),
      ]),
    ),
    ...pack.faction.armyRules.map((rule) => rule.description),
    ...pack.detachments.flatMap((detachment) => detachment.rules.flatMap((rule) => (rule.description ? [rule.description] : []))),
    ...pack.cards.written.flatMap((card) => (card.description ? [card.description] : [])),
    ...referencedRulesOf(pack).map((rule) => rule.description),
  ]

  // A pack goes to paper only with every rule's words in it, so it waits for the rules text this device loads.
  const texts = data ? printedTexts(data) : []
  const { choice } = useSourceTexts(texts)
  const gap = data ? textGap(texts, choice) : null
  usePrintWhenReady(Boolean(data) && gap === null)

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
  const referencedRules = referencedRulesOf(data)
  const warnings = [
    ...(input.draft ? ['Unsaved draft on this device.'] : []),
    ...(input.price.errors.length ? ['Resolve roster validation messages before playing this list.'] : []),
    ...(input.price.points > pointsBudgetOf(input) ? ['Over the points limit.'] : []),
    ...(input.price.unhandled.length ? ['Some restrictions could not be checked. Read the source rules before playing.'] : []),
    ...waivedFormatRules(input.limit, input.waivedRules, input.pointsBudget).map((rule) => `Waived rule: ${rule.label}`),
    ...pickedOptionalRules(input.limit, input.optionalRules).map((rule) => `Optional rule: ${rule.label}`),
    ...(input.price.borrowedDetachment
      ? [`Borrowed disposition from ${input.price.borrowedDetachment}; its detachment rules are not included.`]
      : []),
  ]
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-roster-print-screen>
      <div className="flex gap-2 p-3" data-print-hide>
        <Button variant="outline" onClick={onClose}>
          Return to roster
        </Button>
        <Button disabled={gap !== null} onClick={() => window.print()}>
          Print battle reference pack
        </Button>
      </div>
      {gap ? <TextGapNotice gap={gap} /> : null}
      <div data-battle-reference-pack>
        <header className="pack-masthead">
          <p className="pack-kicker">Battle reference pack</p>
          <h1>{input.name || 'Roster'}</h1>
          <p className="pack-headline">
            {data.faction.displayName} ·{' '}
            {input.price.detachments
              .map((detachment) => `${detachment.name}${detachment.points === null ? '' : ` (${detachment.points} DP)`}`)
              .join(' + ')}
            {input.price.disposition
              ? ` · ${factionDisposition(data.faction, input.price.disposition)?.name ?? input.price.disposition}`
              : ''}{' '}
            · {countLabel(data.groups.length, 'unit')} ·{' '}
            {countLabel(
              input.price.units.reduce((count, unit) => count + unit.size.models, 0),
              'model',
            )}
          </p>
          {warnings.length ? (
            <ul className="pack-warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <p className="pack-fineprint">
            {rulesVersionLabel({ ...data.faction, edition: input.price.edition ?? data.faction.edition })}
            {data.cards.dataslate ? ` · ${data.cards.dataslate}` : ''} · Catalogue revision{' '}
            <span className="break-all">{input.price.revision}</span> ·{' '}
            {input.url ? (
              <>
                <a href={input.url}>{input.url}</a> (keeps the roster’s access restrictions)
              </>
            ) : (
              'Draft on this device; save it for a roster link'
            )}
            . Records the army at printing time; reference data can change.
          </p>
        </header>
        {data.groups.map(({ host, joined }, index) => (
          <section className="pack-unit" id={`pack-unit-${host.key}`} key={host.key} data-print-unit={host.name}>
            {[host, ...joined].map((unit) => (
              <article key={unit.key} className="pack-sheet" data-print-datasheet={unit.name}>
                <header>
                  <h2>
                    <span className="pack-number">{index + 1}</span>
                    {title(unit)}
                  </h2>
                  <p>
                    {countLabel(unit.size.models, 'model')} · {unit.points} pts
                    {hasWarlordToggle(unit.toggles) ? ' · Warlord' : ''}
                    {unit === host ? '' : ` · ${ATTACHMENT_LABELS[unit.attachment?.kind ?? 'support'].joining} ${title(host)}`}
                  </p>
                </header>
                {unit.wargear.length ? (
                  <p className="pack-wargear">
                    <span>Wargear</span> {unit.wargear.map((piece) => `${piece.count}× ${piece.name}`).join(', ')}
                  </p>
                ) : null}
                {input.picks[unit.key]?.note ? (
                  <p className="pack-note ph-no-capture whitespace-pre-line" data-print-note>
                    <span>Note</span> {input.picks[unit.key]?.note}
                  </p>
                ) : null}
                <RosterPrintDatasheet sheet={unit.sheets.selected!} />
              </article>
            ))}
          </section>
        ))}
        <div className="pack-appendix">
          <section className="pack-section">
            <h2>Army rules</h2>
            {data.faction.armyRules.length ? (
              data.faction.armyRules.map((rule) => (
                <section className="pack-rule" key={rule.name}>
                  <h3>{rule.name}</h3>
                  <RuleText text={rule.description} className={PRINTED_RULE} />
                </section>
              ))
            ) : (
              <p>No army rule description is available.</p>
            )}
            {data.detachments.map((detachment) => (
              <section key={detachment.name}>
                <h3 className="pack-subhead">{detachment.name}</h3>
                {detachment.rules.length ? (
                  detachment.rules.map((rule) => (
                    <section className="pack-rule" key={rule.name}>
                      <h3>{rule.name}</h3>
                      {rule.description ? (
                        <RuleText text={rule.description} className={PRINTED_RULE} />
                      ) : (
                        <p>No description is available.</p>
                      )}
                    </section>
                  ))
                ) : (
                  <p>No detachment rule description is available.</p>
                )}
              </section>
            ))}
          </section>
          <section className="pack-section">
            <h2>Stratagems</h2>
            {stratagems.map((stratagem) => {
              const written = data.cards.written.find((card) => card.key === stratagem.key)
              return (
                <section className="pack-rule pack-stratagem" key={stratagem.key}>
                  <h3>
                    <span>{stratagem.name}</span>
                    <span className="pack-cp">{stratagem.cp} CP</span>
                  </h3>
                  <p className="pack-meta">
                    {[stratagem.detachment, written?.type, ...stratagemTiming(stratagem)].filter(Boolean).join(' · ')}
                  </p>
                  {written?.description ? (
                    <RuleText text={written.description} className={PRINTED_RULE} />
                  ) : (
                    <p>No description is available.</p>
                  )}
                </section>
              )
            })}
          </section>
          <section className="pack-section">
            <h2>Abilities and weapon rules</h2>
            {referencedRules.map((rule) => (
              <section className="pack-rule" key={`${rule.name}\0${rule.description}`}>
                <h3>{rule.name}</h3>
                <RuleText text={rule.description} className={PRINTED_RULE} />
              </section>
            ))}
          </section>
        </div>
        {/* A printed pack leaves the app and its sources page, so it names where its words and prices came from. */}
        <p>Rules text from BSData and Game Datacards; prices from the BSData Munitorum Field Manual. Data sources: praetorium.gg/sources</p>
      </div>
    </div>
  )
}

type TextGap = 'unchosen' | 'loading' | 'failed'

/** What still keeps rules text off the page, the most actionable first, or null once every text has loaded. */
function textGap(texts: readonly string[], choice: TextSourceChoice): TextGap | null {
  const gaps = new Set(
    texts.map((text) => {
      // Text without tokens is BSData's own words, which show only where the reader chose BSData.
      if (!hasTextTokens(text)) return choice.sources.has('bsdata') ? null : 'unchosen'
      const missing = loadedText(text, choice).missing
      return missing === 'unavailable' ? null : missing
    }),
  )
  return (['unchosen', 'failed', 'loading'] as const).find((gap) => gaps.has(gap)) ?? null
}

function TextGapNotice({ gap }: { gap: TextGap }) {
  return (
    <div className="mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-sunken p-3 text-sm" data-print-hide>
      {gap === 'unchosen' ? (
        <>
          <p className="min-w-0 flex-1">Printing needs the rules text, which loads on this device from the community sources you choose.</p>
          <Button size="sm" onClick={() => openTextSourcesDialog()}>
            Choose sources
          </Button>
        </>
      ) : gap === 'failed' ? (
        <>
          <p role="alert" className="min-w-0 flex-1">
            Some rules text could not be loaded, so the pack is not ready to print.
          </p>
          <Button size="sm" variant="outline" onClick={() => void retryFailedTextFiles()}>
            Retry
          </Button>
        </>
      ) : (
        <output>Loading rules text…</output>
      )}
    </div>
  )
}
