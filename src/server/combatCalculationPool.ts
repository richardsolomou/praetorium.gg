import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { globalSingleton } from 'ras-stack/server'
import type { CombatAnswer, CombatRequest } from '../core/combatMatchup'
import { CombatAnswerCache } from '../shared/combatAnswerCache'

type Task = {
  request: CombatRequest
  resolve: (answer: CombatAnswer) => void
  reject: (error: unknown) => void
  stop: () => void
  timer: ReturnType<typeof setTimeout>
}
type Slot = { worker: Worker; task?: Task; stopping?: Promise<void> }

export class CombatCalculationPool {
  private slots: Slot[] = []
  private queue: Task[] = []
  private closed = false
  private cache = new CombatAnswerCache(32 * 1024 * 1024)

  constructor(
    private readonly createWorker: () => Worker,
    private readonly concurrency = 2,
    private readonly maxPending = 64,
    private readonly timeout = 15_000,
  ) {}

  calculate(request: CombatRequest, signal: AbortSignal): Promise<CombatAnswer> {
    signal.throwIfAborted()
    if (this.closed) return Promise.reject(new Error('The calculation service is stopping.'))
    const cached = this.cache.read(request)
    if (cached) return Promise.resolve(cached)
    if (this.queue.length + this.slots.filter((slot) => slot.task).length >= this.maxPending)
      return Promise.reject(new Error('The calculation service is busy.'))
    return new Promise((resolve, reject) => {
      const cancel = (error: unknown) => {
        const slot = this.slots.find((candidate) => candidate.task === task)
        if (slot) void this.remove(slot)
        else this.queue = this.queue.filter((candidate) => candidate !== task)
        task.stop()
        reject(error)
        this.dispatch()
      }
      const abort = () => cancel(signal.reason)
      const task: Task = {
        request,
        resolve,
        reject,
        stop: () => {
          clearTimeout(task.timer)
          signal.removeEventListener('abort', abort)
        },
        timer: setTimeout(() => cancel(new Error('The calculation service took too long.')), this.timeout),
      }
      signal.addEventListener('abort', abort, { once: true })
      this.queue.push(task)
      this.dispatch()
    })
  }

  private remove(slot: Slot) {
    if (slot.stopping) return slot.stopping
    slot.task = undefined
    slot.worker.removeAllListeners()
    slot.worker.on('error', () => {})
    slot.stopping = slot.worker.terminate().then(
      () => {
        this.slots = this.slots.filter((candidate) => candidate !== slot)
        this.dispatch()
      },
      (error: unknown) => {
        console.error({ event: 'combat_worker_termination_failed', error })
      },
    )
    return slot.stopping
  }

  private dispatch() {
    while (!this.closed && this.queue.length) {
      let slot = this.slots.find((candidate) => !candidate.task && !candidate.stopping)
      if (!slot && this.slots.length >= this.concurrency) return
      if (!slot) {
        try {
          slot = { worker: this.createWorker() }
          this.slots.push(slot)
          const created = slot
          created.worker.on('message', (answer: CombatAnswer) => {
            const task = created.task
            if (!task) return
            created.task = undefined
            task.stop()
            this.cache.write(task.request, answer)
            task.resolve(answer)
            created.worker.unref()
            this.dispatch()
          })
          const fail = () => {
            const task = created.task
            void this.remove(created)
            task?.stop()
            task?.reject(new Error('The calculation worker stopped.'))
            this.dispatch()
          }
          created.worker.on('error', fail)
          created.worker.on('exit', fail)
          created.worker.on('messageerror', fail)
        } catch (error) {
          const task = this.queue.shift()!
          task.stop()
          task.reject(error)
          continue
        }
      }
      const task = this.queue.shift()!
      slot.task = task
      slot.worker.ref()
      try {
        slot.worker.postMessage(task.request)
      } catch (error) {
        void this.remove(slot)
        task.stop()
        task.reject(error)
      }
    }
  }

  async close() {
    this.closed = true
    for (const task of [...this.queue, ...this.slots.flatMap((slot) => (slot.task ? [slot.task] : []))]) {
      task.stop()
      task.reject(new Error('The calculation service is stopping.'))
    }
    this.queue = []
    this.cache.clear()
    await Promise.all(this.slots.map((slot) => this.remove(slot)))
  }
}

export const combatCalculationPool = globalSingleton(
  'praetorium.combatCalculationPool',
  () =>
    new CombatCalculationPool(() => {
      const production = process.env.NODE_ENV === 'production'
      const filename = production
        ? path.resolve(process.env.LOCAL_BUILD_DIR ?? '.output', 'server/combat-calculation-worker.mjs')
        : path.resolve('src/server/combatCalculation.worker.ts')
      return new Worker(filename, {
        execArgv: production ? [] : ['--import', 'tsx'],
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      })
    }),
)
