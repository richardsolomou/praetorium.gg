import { parseChangesetFile } from '@changesets/parse'

export function validateChangeset(file: string, contents: string, expectedName: string): string[] {
  let releases
  try {
    releases = parseChangesetFile(contents).releases
  } catch {
    return [`${file}: missing or invalid frontmatter`]
  }

  return releases.flatMap(({ name }) =>
    name === expectedName ? [] : [`${file}: references package "${name}", but package.json is "${expectedName}"`],
  )
}
