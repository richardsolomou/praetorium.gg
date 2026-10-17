/** A search flag as the router parses it from `?flag=true`, or as code passes it. */
export const searchFlag = (value: unknown) => value === true || value === 'true'
