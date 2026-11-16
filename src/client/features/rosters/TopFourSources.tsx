import { Fragment } from 'react'
import { TOP_FOUR_SOURCES } from '../../queries'

/** Links to each site the top-four lists come from, joined as a sentence reads them. */
export function TopFourSources() {
  return TOP_FOUR_SOURCES.map(({ name, url }, at) => (
    <Fragment key={name}>
      {at ? ' and ' : null}
      <a href={url} target="_blank" rel="noreferrer" className="underline">
        {name}
      </a>
    </Fragment>
  ))
}
