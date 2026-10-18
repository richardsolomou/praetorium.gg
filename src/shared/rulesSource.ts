export const titleCase = (name: string) =>
  name.toLowerCase().replaceAll(/(^|[\s(\-–—])([a-z])/g, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`)
