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
import { cn } from '@/lib/utils'

export type SearchableOption = { label: string; value: string }
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
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm font-normal text-bone outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted data-placeholder:text-muted-foreground',
          className,
        )}
      >
        <ComboboxValue placeholder={placeholder} />
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
                    {option.label}
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
