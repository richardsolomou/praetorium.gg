import { useQuery } from '@tanstack/react-query'
import { ruleSummaryCreditsQuery } from '../../queries/references'
import { LegalLinks, LegalPage, LegalSection } from './LegalPage'

const linkClass = 'text-info hover:text-parchment'

/** The upstream work the pinned summaries adapt, as their records credit it: nothing where none does. */
function SummaryCredits() {
  const { data: credits = [] } = useQuery(ruleSummaryCreditsQuery())
  return credits.map((credit) => (
    <span key={`${credit.credit} ${credit.licence}`}>
      {' '}
      Some of them adapt work by{' '}
      <a href={credit.url} className={linkClass}>
        {credit.credit}
      </a>
      , licensed under{' '}
      <a href={credit.licence} className={linkClass}>
        {/creativecommons\.org\/licenses\/by\/4\.0/.test(credit.licence) ? 'CC BY 4.0' : 'its own licence'}
      </a>
      .
    </span>
  ))
}

export function Sources() {
  return (
    <LegalPage title="Data sources" updated="23 November 2026">
      <LegalSection title="Rules text">
        <p>
          Rules text is copyrighted material, so Praetorium never shows or serves it. Rules appear as plain-language summaries from VS Data,
          written for each rules version and checked against the official sources. A rule without a summary shows its name and numbers only.
        </p>
      </LegalSection>

      <LegalSection title="Community data">
        <p>Praetorium also serves reference data from these community projects:</p>
        <LegalLinks>
          <li>
            Faction entries, constraints, modifiers, and costs from{' '}
            <a href="https://github.com/richardsolomou/wh40k-11e" className={linkClass}>
              BSData
            </a>
            .
          </li>
          <li>
            Detachment names and numbers from{' '}
            <a href="https://github.com/game-datacards/datasources" className={linkClass}>
              Game Datacards
            </a>
            .
          </li>
          <li>
            Current unit, wargear, detachment, enhancement, and upgrade prices from{' '}
            <a href="https://github.com/richardsolomou/wh40k-11e-mfm" className={linkClass}>
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
            Plain-language rules summaries for each rules version, stratagem timings and mission scoring, and the names the official app
            prints in each of its languages, used to read lists exported in another language, from{' '}
            <a href="https://github.com/richardsolomou/vs-data" className={linkClass}>
              VS Data
            </a>
            , licensed under MIT.
            <SummaryCredits />
          </li>
          <li>
            Further translated names, used to read lists exported in another language, from{' '}
            <a href="https://nrdata.org" className={linkClass}>
              New Recruit’s community translations
            </a>
            .
          </li>
          <li>
            King of the Colosseum battlefield diagrams from{' '}
            <a href="https://playontabletop.com/kotc/" className={linkClass}>
              Play On Tabletop
            </a>{' '}
            and the mat{' '}
            <a href="https://store.frontlinegaming.org/products/flg-mats-king-of-the-colosseum" className={linkClass}>
              Frontline Gaming
            </a>{' '}
            prints for it.
          </li>
        </LegalLinks>
        <p>Each source retains its rights in its work. Praetorium does not claim ownership of the source data.</p>
        <p>
          Praetorium can publish sourced catalogue additions before community datasets include them. Unreleased rules versions are labelled
          Preview and selected per roster. Released rules remain the default.
        </p>
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
