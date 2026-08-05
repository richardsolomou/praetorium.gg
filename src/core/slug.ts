/** A stable, readable URL segment made from a catalogue display name. */
export const routeSlug = (name: string) =>
  name
    .split(' - ')
    .at(-1)!
    .toLocaleLowerCase()
    .replaceAll(/['’]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
