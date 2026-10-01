/** One labelled value in a `dl`, with the full value on hover when a narrow column truncates it. */
export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="truncate text-bone" title={value}>
        {value}
      </dd>
    </div>
  )
}
