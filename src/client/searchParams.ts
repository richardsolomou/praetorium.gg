/** A search flag as the router parses it from `?flag=true`, or as code passes it. */
export const searchFlag = (value: unknown) => value === true || value === 'true'

/** A search value as text, or undefined when it is empty, longer than `max`, or not text at all. */
export const searchText = (value: unknown, max = Infinity) =>
  typeof value === 'string' && value && value.length <= max ? value : undefined
