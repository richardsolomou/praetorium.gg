import { rulesVersionDetails } from '../../core/catalogueEdition'

export function RulesVersionLabel({ faction }: { faction: Parameters<typeof rulesVersionDetails>[0] }) {
  const { name, status } = rulesVersionDetails(faction)
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      {status ? (
        <>
          <span
            data-rules-status={status.toLowerCase()}
            className={`chip w-16 shrink-0 justify-center ${status === 'Current' ? 'border-achieved/40 text-achieved!' : status === 'Preview' ? 'border-discarded/40 text-discarded!' : 'text-dim!'}`}
          >
            {status}
          </span>{' '}
        </>
      ) : null}
      <span className="min-w-0 whitespace-normal text-left leading-tight" title={faction.edition?.description}>
        {name}
      </span>
    </span>
  )
}
