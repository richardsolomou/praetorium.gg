import { rulesVersionDetails } from '../../core/catalogueEdition'

export function RulesVersionLabel({ faction }: { faction: Parameters<typeof rulesVersionDetails>[0] }) {
  const { name, status } = rulesVersionDetails(faction)
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <span className="min-w-0 whitespace-normal text-left leading-tight" title={faction.edition?.description}>
        {name}
      </span>
      {status ? (
        <>
          {' '}
          <span
            data-rules-status={status.toLowerCase()}
            className={`chip shrink-0 ${status === 'Preview' ? 'border-discarded/40 text-discarded' : ''}`}
          >
            {status}
          </span>
        </>
      ) : null}
    </span>
  )
}
