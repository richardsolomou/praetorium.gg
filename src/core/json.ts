/** The UTF-8 size of a value's JSON. */
export const jsonByteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
