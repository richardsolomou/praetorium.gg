/**
 * Resolves on a later task, so long work lets the event loop answer whatever else is waiting. A message, unlike a
 * nested `setTimeout(0)`, is not held to the 4 ms minimum browsers give repeated timers.
 */
export const nextTask = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
