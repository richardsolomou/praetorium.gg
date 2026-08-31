import { createFileRoute } from '@tanstack/react-router'
import { LegalLinks, LegalPage, LegalSection } from '../client/components/LegalPage'

export const Route = createFileRoute('/sources')({
  head: () => ({
    meta: [
      { title: 'Data sources — Praetorium' },
      { name: 'description', content: 'The community data sources, licences, attribution, and trademark notice for Praetorium.' },
    ],
  }),
  component: Sources,
})

const linkClass = 'text-info hover:text-parchment'

function Sources() {
  return (
    <LegalPage title="Data sources" updated="31 August 2026">
      <LegalSection title="Community data">
        <p>Praetorium converts these community sources into versioned, checksummed snapshots:</p>
        <LegalLinks>
          <li>
            Faction entries, constraints, modifiers, and costs from{' '}
            <a href="https://github.com/BSData/wh40k-11e" className={linkClass}>
              BSData
            </a>
            .
          </li>
          <li>
            Stratagem, mission, and scoring data by Alpaca Software and the 40kdc community contributors. This data is licensed under{' '}
            <a href="https://github.com/wn-mitch/40kdc-data/blob/main/LICENSE-DATA" className={linkClass}>
              CC BY 4.0
            </a>
            . Praetorium changes the source files to match its internal snapshot format.{' '}
            <a href="https://40kdc.alpacasoft.dev" className={linkClass}>
              Powered by 40kdc-data
            </a>
            .
          </li>
          <li>
            Faction descriptions, mission layouts, and other reference data from{' '}
            <a href="https://github.com/game-datacards/datasources" className={linkClass}>
              game-datacards
            </a>
            .
          </li>
          <li>
            Terrain geometry from{' '}
            <a href="https://battlemaster.online" className={linkClass}>
              Battlemaster
            </a>
            .
          </li>
        </LegalLinks>
        <p>Each source retains its rights in its work. Praetorium does not claim ownership of the source data.</p>
      </LegalSection>

      <LegalSection title="Trademarks">
        <p>
          Warhammer 40,000 and related marks belong to Games Workshop. Praetorium is unofficial and is not affiliated with or endorsed by
          Games Workshop. Nothing on this site is an official product or rules reference.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
