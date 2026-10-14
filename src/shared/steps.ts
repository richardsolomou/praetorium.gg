/** Synchronous work that marks with each `yield` a point where a background run may let other work in. */
export type Steps<T> = Generator<void, T, void>

export function completeSteps<T>(steps: Steps<T>): T {
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

/** One result built from steps, all at once by `get` or a step at a time by `step`, each continuing the other's progress. */
export type Stepwise<T> = { get: () => T; step: () => boolean }

export function stepwise<T>(start: () => Steps<T>): Stepwise<T> {
  let steps: Steps<T> | undefined
  let result: { value: T } | undefined
  const step = () => {
    if (result) return true
    try {
      const next = (steps ??= start()).next()
      if (!next.done) return false
      result = { value: next.value }
      steps = undefined
      return true
    } catch (error) {
      // A failure is not kept: the next read starts the work again.
      steps = undefined
      throw error
    }
  }
  return {
    get: () => {
      while (!step());
      return result!.value
    },
    step,
  }
}

export function* stepThrough<T>(work: Stepwise<T>): Steps<T> {
  while (!work.step()) yield
  return work.get()
}
