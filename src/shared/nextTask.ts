/** Resolves on a later task, so long work lets the event loop answer whatever else is waiting. */
export const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
