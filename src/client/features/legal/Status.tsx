import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { STATUS_DESCRIPTION, type ServiceStatus } from '../../../contracts/serviceStatus'
import { PageContent, PageHeader } from '../../components/Page'
import { RulesVersionLabel } from '../../components/RulesVersionLabel'
import { SectionHeading } from '../../components/SectionHeading'
import { useMoment } from '../../dates'
import { SOURCE } from '../../projectLinks'
import { serviceStatusQuery } from '../../queries'

const ARMY_DATA: Record<ServiceStatus['catalogue']['sync'], string> = {
  ready: 'Up to date',
  working: 'Updating',
  failed: 'Update failed',
  absent: 'Not loaded',
}

const linkClass = 'text-info hover:text-parchment'

const CHECK: Record<'checking' | 'up' | 'down' | 'unreachable', { Icon: LucideIcon; tone: string; summary: string }> = {
  checking: { Icon: LoaderCircle, tone: 'animate-spin text-dim', summary: 'Checking Praetorium…' },
  up: { Icon: CircleCheck, tone: 'text-parchment', summary: 'Praetorium is working.' },
  down: {
    Icon: CircleAlert,
    tone: 'text-discarded',
    summary: 'Some parts of Praetorium are not working. Signing in, saving or battles can fail until this clears.',
  },
  unreachable: {
    Icon: CircleAlert,
    tone: 'text-side-a',
    summary: 'Praetorium did not answer. Check your connection, then reload this page.',
  },
}

export function Status() {
  const { data, isError, dataUpdatedAt } = useQuery(serviceStatusQuery())
  const moment = useMoment()
  const { Icon, tone, summary } = CHECK[isError ? 'unreachable' : !data ? 'checking' : data.up ? 'up' : 'down']
  return (
    <main className="w-full">
      <PageHeader title="Status" description={STATUS_DESCRIPTION} />
      <PageContent>
        <div className="max-w-2xl space-y-10">
          <section aria-labelledby="service" className="space-y-2">
            <SectionHeading id="service" title="Service" />
            <output className="flex items-start gap-2 font-semibold text-bone">
              <Icon className={`mt-0.5 size-5 shrink-0 ${tone}`} aria-hidden />
              <span>{summary}</span>
            </output>
            {dataUpdatedAt ? (
              <p className="text-sm text-dim">Checked {moment(dataUpdatedAt)}. This page checks again every minute.</p>
            ) : null}
          </section>

          {data ? (
            <section aria-labelledby="serving" className="space-y-2">
              <SectionHeading id="serving" title="What it serves" />
              <dl className="divide-y divide-edge text-sm">
                <Detail term="Release">
                  <Link to="/whats-new" className={linkClass}>
                    <span className="readout">{data.release}</span>
                  </Link>
                </Detail>
                <Detail term="Build">
                  {data.commit && (
                    <a href={`${SOURCE}/commit/${data.commit}`} className={linkClass} target="_blank" rel="noreferrer noopener">
                      <span className="readout">{data.commit.slice(0, 7)}</span>
                    </a>
                  )}
                </Detail>
                <Detail term="Army data">{ARMY_DATA[data.catalogue.sync]}</Detail>
                <Detail term="Army data snapshot">
                  {data.catalogue.snapshot && <span className="readout">{data.catalogue.snapshot.slice(0, 12)}</span>}
                </Detail>
                <Detail term="Rules versions">
                  {data.rulesVersions.length > 0 && (
                    <ul className="space-y-1.5">
                      {data.rulesVersions.map(({ name, status, default: isDefault }) => (
                        <li key={name}>
                          <RulesVersionLabel faction={{ edition: { name, status }, isDefault }} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Detail>
              </dl>
            </section>
          ) : null}

          <p className="text-sm text-dim">
            Something fails while this page says Praetorium is working? Tell us from{' '}
            <Link to="/support" className={linkClass}>
              Support
            </Link>
            , and include the release shown here.
          </p>
        </div>
      </PageContent>
    </main>
  )
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-dim">{term}</dt>
      <dd className="min-w-0 text-bone">{children || 'Not recorded'}</dd>
    </div>
  )
}
