import { LegalLinks, LegalPage, LegalSection } from './LegalPage'

const linkClass = 'text-info hover:text-parchment'

export function Sources() {
  return (
    <LegalPage title="Data sources" updated="2 October 2026">
      <LegalSection title="Community data">
        <p>Praetorium uses rules and reference data from these community projects:</p>
        <LegalLinks>
          <li>
            Faction entries, constraints, modifiers, and costs from{' '}
            <a href="https://github.com/BSData/wh40k-11e" className={linkClass}>
              BSData
            </a>
            .
          </li>
          <li>
            Provisional Space Marines codex records from{' '}
            <a href="https://github.com/richardsolomou/wh40k-11e" className={linkClass}>
              the pinned community fork
            </a>
            .
          </li>
          <li>
            Faction descriptions, stratagems, missions, scoring, and layout names from{' '}
            <a href="https://github.com/game-datacards/datasources" className={linkClass}>
              game-datacards
            </a>
            .
          </li>
          <li>
            Current unit, wargear, detachment, enhancement, and upgrade prices from{' '}
            <a href="https://github.com/BSData/wh40k-11e-mfm" className={linkClass}>
              BSData Munitorum Field Manual
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
          <li>
            Faction icons from{' '}
            <a href="https://github.com/Certseeds/wh40k-icon" className={linkClass}>
              Certseeds/wh40k-icon
            </a>
            , licensed under AGPL-3.0.
          </li>
          <li>
            King of the Colosseum battlefield diagrams from{' '}
            <a href="https://playontabletop.com/kotc/" className={linkClass}>
              Play On Tabletop
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
