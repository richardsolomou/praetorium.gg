import { useReferenceFaction } from './useReferenceFaction'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FactionBreadcrumb } from './FactionBreadcrumb'
import { ChevronRight, FileSearch } from 'lucide-react'
import { memo, useDeferredValue, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'
import type { FactionDatasheet } from '../../../../contracts/catalogue'
import { usableDatasheets } from '../../../../core/collection'
import { toggled } from '../../../../core/collections'
import { collectionCountsAsQuery, collectionQuery, factionDatasheetsQuery, meQuery } from '../../../queries'
import { ACCOUNT_FILTERS, type AccountFilter, FilterChip } from '../../../components/FilterChip'
import { DATASHEET_SOURCES, type DatasheetSource, filterDatasheets, keywordOptions, sourceOf } from './datasheetFilters'
import { useSettled } from '../../../useSettled'
import { FactionMark, factionColour } from '../../../components/FactionMark'
import { FavouriteDatasheetToggle } from './FavouriteDatasheetToggle'
import { useFavouriteDatasheets } from '../../../favouriteDatasheets'
import { favouritesFirst } from '../../../favouriteFactions'
import { SearchField } from '../../../components/SearchField'
import { DatasheetMatchReasons } from '../../../components/DatasheetMatchReasons'
import { GROUPS } from '../../../unitGroups'
import { Section } from '../../rosters/builder/Section'
import { PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'

export function FactionDatasheets() {
  const faction = useReferenceFaction()
  const [query, setQuery] = useState('')
  const settledQuery = useSettled(query.trim())
  const { data: found = [], isPending } = useQuery({
    ...factionDatasheetsQuery(faction?.id ?? '', settledQuery),
    placeholderData: keepPreviousData,
  })
  // Filters offer what the whole faction has, not only what the search left.
  const { data: all = [] } = useQuery(factionDatasheetsQuery(faction?.id ?? '', ''))
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const { favourites } = useFavouriteDatasheets(signedIn)
  const { data: owned } = useQuery({ ...collectionQuery(), enabled: signedIn })
  const { data: countsAs } = useQuery({ ...collectionCountsAsQuery(), enabled: signedIn })
  const collection = useMemo(() => usableDatasheets(owned ?? [], countsAs ?? {}), [owned, countsAs])
  const [hidden, setHidden] = useState<ReadonlySet<DatasheetSource>>(new Set())
  const [keywords, setKeywords] = useState<ReadonlySet<string>>(new Set())
  const [account, setAccount] = useState<ReadonlySet<AccountFilter>>(new Set())
  const sources = DATASHEET_SOURCES.filter((source) => source.id === 'matched' || all.some((unit) => sourceOf(unit) === source.id))
  const keywordChoices = useMemo(() => keywordOptions(all), [all])
  const accountSets = useMemo(() => ({ favourite: favourites, owned: collection }), [favourites, collection])
  // Every row mounts or redraws when the list changes, so it renders behind the tap or keystroke instead of before its paint.
  const units = useDeferredValue(
    useMemo(
      () => filterDatasheets(found, { hidden, keywords, only: [...account].map((filter) => accountSets[filter]) }),
      [found, hidden, keywords, account, accountSets],
    ),
  )
  const listQuery = useDeferredValue(settledQuery)
  const filtered = hidden.size > 0 || keywords.size > 0 || account.size > 0
  const clearFilters = () => {
    setHidden(new Set())
    setKeywords(new Set())
    setAccount(new Set())
  }
  if (!faction) return null

  return (
    <main className="w-full">
      <PageHeader
        tint={factionColour(faction.slug, faction.displayName)}
        eyebrow={faction.displayName}
        title="Datasheets"
        media={<FactionMark faction={faction} />}
      />
      <PageContent className="space-y-6">
        <FactionBreadcrumb faction={faction} />
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Find a datasheet"
          label="Find a datasheet"
          clearLabel="Empty the datasheet filter"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {signedIn
            ? ACCOUNT_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.id}
                  label={filter.label}
                  hint={filter.hint}
                  icon={filter.icon}
                  pressed={account.has(filter.id)}
                  onToggle={() => setAccount(toggled(account, filter.id))}
                  unavailable={accountSets[filter.id].size ? undefined : filter.empty}
                />
              ))
            : null}
          {sources.length > 1
            ? sources.map((source) => (
                <FilterChip
                  key={source.id}
                  label={source.label}
                  hint={source.hint}
                  pressed={!hidden.has(source.id)}
                  onToggle={() => setHidden(toggled(hidden, source.id))}
                />
              ))
            : null}
          {keywordChoices.length ? <KeywordFilter choices={keywordChoices} chosen={keywords} onChange={setKeywords} /> : null}
          {filtered ? (
            <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs text-dim" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
        <section>
          <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
            <span>Datasheets</span>
            {/* The faction's own count is an estimate from its cards, so it only stands in until the list itself arrives. */}
            <span className="readout">{isPending ? faction.references[0]?.datasheets : units.length}</span>
          </h2>
          <div className="mt-2">
            {units.length ? (
              GROUPS.map((group) => {
                const rows = favouritesFirst(
                  units.filter((unit) => unit.group === group.id),
                  favourites,
                )
                return rows.length ? (
                  <Section key={group.id} title={group.plural} count={rows.length}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {rows.map((unit) => (
                        <FactionDatasheetRow key={unit.id} catalogueId={faction.slug} unit={unit} query={listQuery} />
                      ))}
                    </div>
                  </Section>
                ) : null
              })
            ) : (
              <PageState
                headingLevel={2}
                loading={isPending}
                icon={FileSearch}
                eyebrow={query.trim() || filtered ? 'Datasheet search' : faction.displayName}
                title={isPending ? 'Loading datasheets' : query.trim() || filtered ? 'No datasheets match' : 'No datasheets available'}
                explanation={
                  isPending
                    ? 'Loading datasheets and points.'
                    : filtered
                      ? 'Turn off a filter or clear the search.'
                      : query.trim()
                        ? 'Try another datasheet name or clear the search.'
                        : 'This faction has no datasheets in the current data.'
                }
              />
            )}
          </div>
        </section>
      </PageContent>
    </main>
  )
}

const FactionDatasheetRow = memo(function FactionDatasheetRow({
  catalogueId,
  unit,
  query,
}: {
  catalogueId: string
  unit: FactionDatasheet
  query: string
}) {
  return (
    <div
      data-datasheet={unit.name}
      className="flex w-full min-w-0 items-center border border-edge bg-panel [contain:layout_style] hover:border-info"
    >
      <FactionReferenceLink
        to="/factions/$catalogueId/datasheets/$entryId"
        params={{ catalogueId, entryId: unit.slug }}
        className="flex min-w-0 flex-1 items-center px-3 py-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold uppercase">{unit.name}</span>
          <DatasheetMatchReasons query={query} reasons={unit.matchReasons} fuzzy={unit.fuzzy} />
        </span>
        {unit.points === null ? null : <span className="chip ml-2 shrink-0 text-info">{unit.points} pts</span>}
        <ChevronRight className="ml-2 size-4 shrink-0 text-dim" aria-hidden />
      </FactionReferenceLink>
      <FavouriteDatasheetToggle entryId={unit.id} name={unit.name} className="size-11" />
    </div>
  )
})

type KeywordChoice = ReturnType<typeof keywordOptions>[number]

/** A datasheet must carry every keyword chosen here; typing narrows a long faction's list of them. */
function KeywordFilter({
  choices,
  chosen,
  onChange,
}: {
  choices: KeywordChoice[]
  chosen: ReadonlySet<string>
  onChange: (keywords: ReadonlySet<string>) => void
}) {
  return (
    <Combobox
      multiple
      items={choices}
      value={choices.filter((choice) => chosen.has(choice.keyword))}
      onValueChange={(picked) => onChange(new Set(picked.map((choice) => choice.keyword)))}
      itemToStringLabel={(choice) => choice.keyword}
      itemToStringValue={(choice) => choice.keyword}
      isItemEqualToValue={(choice, candidate) => choice.keyword === candidate.keyword}
    >
      <ComboboxTrigger
        aria-label="Keywords"
        className={`inline-flex h-7 items-center gap-1 rounded-sm border px-1.5 text-2xs font-semibold tracking-label uppercase transition-colors ${
          chosen.size ? 'border-parchment bg-parchment/15 text-parchment' : 'border-edge-strong text-dim hover:border-dim hover:text-bone'
        }`}
      >
        {chosen.size ? `Keywords · ${chosen.size}` : 'Keywords'}
      </ComboboxTrigger>
      <ComboboxContent className="w-64 min-w-64 transition-none">
        <ComboboxInput placeholder="Find a keyword" showTrigger={false} />
        <ComboboxEmpty className="text-dim">No keywords match.</ComboboxEmpty>
        <ComboboxList>
          {(choice: KeywordChoice) => (
            <ComboboxItem key={choice.keyword} value={choice} aria-label={choice.keyword} className="data-highlighted:bg-edge">
              <span className="min-w-0 flex-1 truncate">{choice.keyword}</span>
              <span className="readout text-2xs text-faint">{choice.count}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
