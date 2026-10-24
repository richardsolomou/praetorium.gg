export type DatasheetPage = { id: string; slug: string }

const idSuffix = (id: string) => `-${id.slice(0, 8)}`

/** A datasheet's page slug: its name, told apart by an id prefix while another page in the book shares it. */
export const datasheetSlugFor = (base: string, id: string, shared: boolean) => (shared ? `${base}${idSuffix(id)}` : base)

const baseOf = (page: DatasheetPage) => (page.slug.endsWith(idSuffix(page.id)) ? page.slug.slice(0, -idSuffix(page.id).length) : page.slug)

/**
 * The page a published datasheet address names. A slug gains or loses its id suffix as same-named
 * datasheets come and go between catalogue updates, so either form keeps resolving; a plain name
 * several pages share names none of them.
 */
export function datasheetPageBySlug<T extends DatasheetPage>(pages: readonly T[], slug: string): T | null {
  const exact = pages.find((page) => page.slug === slug || page.id === slug)
  if (exact) return exact
  const suffixed = pages.find((page) => `${baseOf(page)}${idSuffix(page.id)}` === slug)
  if (suffixed) return suffixed
  const named = pages.filter((page) => baseOf(page) === slug)
  return new Set(named.map((page) => page.id)).size === 1 ? named[0]! : null
}
