import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { RuleReference } from '../../contracts/rules'
import { ruleIndexQuery } from '../queries'
import { ruleLinks } from '../ruleLinks'
import { quotedRuleCodes } from '../ruleMarkup'
export function CitedRules({ text }: { text: string }) {
  const codes = quotedRuleCodes(text)
  const { data: index } = useQuery({ ...ruleIndexQuery(), enabled: codes.length > 0 })
  if (!index) return null
  const links = ruleLinks(index, index.documents[0]?.slug ?? '')
  return codes.flatMap((code) => links.get(code) ?? []).map((reference) => <CitedRule key={reference.code} reference={reference} />)
}

function CitedRule({ reference }: { reference: RuleReference }) {
  return (
    <section className="mt-2 border-t border-edge pt-2">
      <Link
        to="/rules/$documentId/$sectionId"
        params={{ documentId: reference.document, sectionId: reference.section }}
        hash={reference.anchor}
        className="flex items-baseline gap-1.5 font-sans font-semibold text-bone hover:text-info"
      >
        <span className="readout text-faint">{reference.code}</span>
        {reference.title}
      </Link>
    </section>
  )
}
