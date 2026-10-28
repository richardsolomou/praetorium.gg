/** Resolves once the browser has painted, so a press shows its pending state before work that holds the page. */
export const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))
