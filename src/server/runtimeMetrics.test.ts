import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reportRuntimeMetrics } from './runtimeMetrics'

let cpuMs = 0
let reported: Map<string, number[]>
let stop: () => void

beforeEach(() => {
  vi.useFakeTimers()
  cpuMs = 0
  reported = new Map()
  stop = reportRuntimeMetrics((name, value) => reported.set(name, [...(reported.get(name) ?? []), value]), { instance: 'test' }, 3_000, {
    cpuUsage: () => ({ user: cpuMs * 1_000, system: 0 }),
    memoryUsage: () => process.memoryUsage(),
    now: () => Date.now(),
  })
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('reports external allocations and array buffers separately from the JavaScript heap', () => {
  vi.spyOn(process, 'memoryUsage').mockReturnValue({ rss: 100, heapTotal: 80, heapUsed: 60, external: 30, arrayBuffers: 20 })
  busySeconds(0, 0, 0)
  expect(Object.fromEntries([...reported].filter(([name]) => name.startsWith('process.memory.')))).toEqual({
    'process.memory.rss': [100],
    'process.memory.heap_total': [80],
    'process.memory.heap_used': [60],
    'process.memory.external': [30],
    'process.memory.array_buffers': [20],
  })
})

function busySeconds(...shares: number[]) {
  for (const share of shares) {
    cpuMs += share * 1_000
    vi.advanceTimersByTime(1_000)
  }
}

it('reports the busiest second of the interval', () => {
  busySeconds(0.2, 0.75, 0.1)
  expect(reported.get('process.cpu.busiest_second')).toEqual([0.75])
})

it('reports the average share of a core over the interval', () => {
  busySeconds(0.2, 1.2, 0.1)
  expect(reported.get('process.cpu.utilization')).toEqual([0.5])
})

it('measures each interval from its own seconds', () => {
  busySeconds(0.9, 0.1, 0.1, 0.3, 0.2, 0.1)
  expect(reported.get('process.cpu.busiest_second')).toEqual([0.9, 0.3])
})

it('stops reporting when stopped', () => {
  stop()
  busySeconds(0.5, 0.5, 0.5)
  expect(reported.size).toBe(0)
})
