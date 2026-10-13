import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks'

type Gauge = (name: string, value: number, options: { unit: string; attributes: Record<string, string> }) => unknown

type RuntimeProbes = {
  cpuUsage: () => NodeJS.CpuUsage
  memoryUsage: () => NodeJS.MemoryUsage
  now: () => number
}

const SECOND_MS = 1_000

/**
 * Reports process memory, CPU, event-loop delay and garbage-collection pauses once per interval.
 *
 * CPU counts every thread, including V8's background collector, as a share of one core; the busiest second shows
 * short spikes that a per-interval average hides.
 */
export function reportRuntimeMetrics(
  gauge: Gauge,
  attributes: Record<string, string>,
  intervalMs = 60_000,
  probes: RuntimeProbes = { cpuUsage: () => process.cpuUsage(), memoryUsage: () => process.memoryUsage(), now: () => performance.now() },
) {
  const delay = monitorEventLoopDelay({ resolution: 20 })
  delay.enable()
  let gcPauseMs = 0
  let longestGcPauseMs = 0
  const collections = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gcPauseMs += entry.duration
      longestGcPauseMs = Math.max(longestGcPauseMs, entry.duration)
    }
  })
  collections.observe({ entryTypes: ['gc'] })

  const cpuMs = (usage: NodeJS.CpuUsage) => (usage.user + usage.system) / 1_000
  let intervalStart = { at: probes.now(), cpu: cpuMs(probes.cpuUsage()) }
  let secondStart = intervalStart
  let busiestSecond = 0
  const sampleSecond = () => {
    const sample = { at: probes.now(), cpu: cpuMs(probes.cpuUsage()) }
    busiestSecond = Math.max(busiestSecond, (sample.cpu - secondStart.cpu) / Math.max(1, sample.at - secondStart.at))
    secondStart = sample
  }
  const report = () => {
    const memory = probes.memoryUsage()
    const measurements: [string, number, string][] = [
      ['process.memory.rss', memory.rss, 'byte'],
      ['process.memory.heap_used', memory.heapUsed, 'byte'],
      ['process.memory.heap_total', memory.heapTotal, 'byte'],
      ['process.memory.external', memory.external, 'byte'],
      ['process.memory.array_buffers', memory.arrayBuffers, 'byte'],
      ['process.cpu.utilization', (secondStart.cpu - intervalStart.cpu) / Math.max(1, secondStart.at - intervalStart.at), '1'],
      ['process.cpu.busiest_second', busiestSecond, '1'],
      ['process.event_loop.delay.p99', delay.percentile(99) / 1e6, 'ms'],
      ['process.event_loop.delay.max', delay.max / 1e6, 'ms'],
      ['process.gc.pause', gcPauseMs, 'ms'],
      ['process.gc.pause.max', longestGcPauseMs, 'ms'],
    ]
    for (const [name, value, unit] of measurements) gauge(name, value, { unit, attributes })
    intervalStart = secondStart
    busiestSecond = 0
    gcPauseMs = 0
    longestGcPauseMs = 0
    delay.reset()
  }
  const seconds = setInterval(sampleSecond, SECOND_MS)
  const reports = setInterval(report, intervalMs)
  seconds.unref()
  reports.unref()
  return () => {
    clearInterval(seconds)
    clearInterval(reports)
    collections.disconnect()
    delay.disable()
  }
}
