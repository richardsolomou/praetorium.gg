import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  transports: readonly { key: number; label: string }[]
  value: number | undefined
  onChange: (transportKey: number | undefined) => void
}

const OUTSIDE = 'outside'
const OUTSIDE_LABEL = 'Not embarked'

/** The transport a unit starts in, used as the starting choice at battle setup. */
export function UnitEmbark({ transports, value, onChange }: Props) {
  const chosen = transports.find((transport) => transport.key === value)
  return (
    <section className="space-y-1 border-b border-edge pb-3" aria-label="Starting transport">
      <Label htmlFor="unit-embark">Starts embarked in</Label>
      <Select
        value={chosen ? String(chosen.key) : OUTSIDE}
        onValueChange={(next) => onChange(next === null || next === OUTSIDE ? undefined : Number(next))}
      >
        <SelectTrigger id="unit-embark" className="w-full">
          <SelectValue>{() => chosen?.label ?? OUTSIDE_LABEL}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OUTSIDE}>{OUTSIDE_LABEL}</SelectItem>
          {transports.map((transport) => (
            <SelectItem key={transport.key} value={String(transport.key)}>
              {transport.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-dim">Battle setup checks the transport’s capacity, and you can still change it there.</p>
    </section>
  )
}
