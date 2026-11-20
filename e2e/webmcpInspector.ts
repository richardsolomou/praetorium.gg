import type { Page } from './test'

export async function installInspector(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, { execute: (input: object, options: { signal: AbortSignal }) => Promise<unknown> }>()
    const results: unknown[] = []
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: async (
          tool: { name: string; execute: (input: object, options: { signal: AbortSignal }) => Promise<unknown> },
          options: { signal: AbortSignal },
        ) => {
          if (options.signal.aborted) return
          tools.set(tool.name, tool)
          options.signal.addEventListener('abort', () => tools.delete(tool.name), { once: true })
        },
      },
    })
    Object.assign(window, {
      agentInspector: {
        names: () => [...tools.keys()].sort(),
        call: (name: string, input: object) => tools.get(name)!.execute(input, { signal: new AbortController().signal }),
        start: (name: string, input: object) => {
          void tools
            .get(name)!
            .execute(input, { signal: new AbortController().signal })
            .then((result) => results.push(result))
        },
        results,
      },
    })
  })
}

export function names(page: Page) {
  return page.evaluate(() => (window as unknown as { agentInspector: { names: () => string[] } }).agentInspector.names())
}
export function call(page: Page, toolName: string, arguments_: object = {}) {
  return page.evaluate(
    ({ name, input }) =>
      (
        window as unknown as {
          agentInspector: {
            call: (name: string, input: object) => Promise<{ structuredContent?: Record<string, unknown>; isError?: boolean }>
          }
        }
      ).agentInspector.call(name, input),
    { name: toolName, input: arguments_ },
  )
}
