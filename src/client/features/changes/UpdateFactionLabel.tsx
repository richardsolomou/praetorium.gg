export function UpdateFactionLabel({ name }: { name: string }) {
  const [faction, ...rules] = name.split(' · ')
  return (
    <span className="min-w-0">
      <span className="block font-semibold text-bone">{faction}</span>
      {rules.length ? (
        <>
          <span className="sr-only"> · </span>
          <span className="mt-0.5 block text-xs font-normal text-dim normal-case">{rules.join(' · ')}</span>
        </>
      ) : null}
    </span>
  )
}
