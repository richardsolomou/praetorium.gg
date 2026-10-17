import { TEXT_SOURCES } from '../../../shared/sourceText'
import { TextSourceRow } from '../../components/TextSourcesDialog'
import { chooseTextSource, useTextSourceChoice } from '../../rulesText'
import { useHydrated } from '../../useClientValue'
import { LegalLinks, LegalPage, LegalSection } from './LegalPage'

const linkClass = 'text-info hover:text-parchment'

function TextSourceSwitches() {
  const choice = useTextSourceChoice()
  // The stored choice is unknown until hydration, so the switches wait rather than flipping.
  const ready = useHydrated()
  return (
    <div className="space-y-2">
      {TEXT_SOURCES.map((source) => (
        <TextSourceRow
          key={source}
          source={source}
          checked={choice.sources.has(source)}
          disabled={!ready}
          onCheckedChange={(on) => chooseTextSource(source, on)}
        />
      ))}
    </div>
  )
}

export function Sources() {
  return (
    <LegalPage eyebrow="About the data" title="Data sources" updated="17 October 2026">
      <LegalSection title="Rules text">
        <p>
          Praetorium serves names, numbers, points, and battlefield geometry itself. Rules text loads in your browser, straight from the
          community sources you turn on here, and the choice stays on this device.
        </p>
        <TextSourceSwitches />
      </LegalSection>

      <LegalSection title="Community data">
        <p>Praetorium also serves reference data from these community projects:</p>
        <LegalLinks>
          <li>
            Faction entries, constraints, modifiers, and costs from{' '}
            <a href="https://github.com/BSData/wh40k-11e" className={linkClass}>
              BSData
            </a>
            .
          </li>
          <li>
            Stratagem, detachment, mission, and layout names and numbers from{' '}
            <a href="https://github.com/game-datacards/datasources" className={linkClass}>
              Game Datacards
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
