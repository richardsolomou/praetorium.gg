import type { GlobalSearchResult } from '../../functions'
import { FactionLabel } from '../../components/FactionMark'

export function SearchResultDetail({ result }: { result: GlobalSearchResult }) {
  return (
    <span className="result-detail block text-xs text-dim">
      {result.faction ? <FactionLabel faction={result.faction} /> : result.detail}
    </span>
  )
}
