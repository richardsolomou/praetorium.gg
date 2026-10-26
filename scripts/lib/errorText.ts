/** An error's message, without the `Error:` prefix `String` adds, or whatever else was thrown as text. */
export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
