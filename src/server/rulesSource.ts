export const joinKey = (nameOrSlug: string) =>
  nameOrSlug
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')

export const titleCase = (name: string) =>
  name.toLowerCase().replaceAll(/(^|[\s(\-–—])([a-z])/g, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`)
