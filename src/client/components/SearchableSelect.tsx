import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FactionLabel, type FactionPresentation } from './FactionMark'

/**
 * One choice, optionally with something drawn beside its name.
 *
 * `faction` is the faction mark and its name together; `icon` is anything else a
 * caller wants in front of the label, such as the picture on a player's account.
 */
export type SearchableOption = { label: string; value: string; faction?: FactionPresentation; icon?: ReactNode }
export type SearchableGroup = { label: string; items: SearchableOption[] }

type Props = {
  id?: string
  ariaLabel?: string
  groups: SearchableGroup[]
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  searchPlaceholder?: string
  className?: string
}

export function SearchableSelect({
  id,
  ariaLabel,
  groups,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder = 'Search…',
  className,
}: Props) {
  const selected = groups.flatMap((group) => group.items).find((option) => option.value === value) ?? null

  return (
    <Combobox
      items={groups}
      value={selected}
      onValueChange={(option) => {
        if (option) onValueChange(option.value)
      }}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(option, candidate) => option.value === candidate.value}
    >
      <ComboboxTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'flex h-9 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border border-input bg-transparent px-2.5 text-sm font-normal text-bone outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted data-placeholder:text-muted-foreground',
          className,
        )}
      >
        <span className="min-w-0 flex-1 overflow-hidden text-left">
          <ComboboxValue placeholder={placeholder}>{selected ? <OptionLabel option={selected} /> : null}</ComboboxValue>
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="rounded-none border border-edge bg-panel text-bone ring-0 transition-none">
        <ComboboxInput className="rounded-none" placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxEmpty className="text-dim">No matches.</ComboboxEmpty>
        <ComboboxList>
          {(group: SearchableGroup) => (
            <ComboboxGroup key={group.label} items={group.items} className="pb-1 last:pb-0">
              {group.label ? <ComboboxLabel className="eyebrow text-faint">{group.label}</ComboboxLabel> : null}
              <ComboboxCollection>
                {(option: SearchableOption) => (
                  <ComboboxItem key={option.value} value={option} className="rounded-none data-highlighted:bg-edge">
                    <OptionLabel option={option} />
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function OptionLabel({ option }: { option: SearchableOption }) {
  if (option.faction) return <FactionLabel faction={option.faction} />
  if (!option.icon) return option.label
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      {option.icon}
      <span className="truncate">{option.label}</span>
    </span>
  )
}
