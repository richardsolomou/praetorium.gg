import type { ChildProcess } from 'node:child_process'
import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import type httpProxy from 'http-proxy'

export function nodeLifecycle({ drainMs = 5_000, childMs = 3_000 } = {}) {
  const controller = new AbortController()
  const sockets = new Set<Duplex>()
  const upgrades = new Set<Duplex>()
  let child: ChildProcess | undefined
  let server: Server | undefined
  let proxy: httpProxy | undefined
  let stopping: Promise<void> | undefined
  let childClosed: Promise<void> = Promise.resolve()
  let failure: Error | undefined
  let finish!: () => void
  const finished = new Promise<void>((resolve) => {
    finish = resolve
  })

  const stop = () => {
    if (stopping) return stopping
    controller.abort()
    stopping = (async () => {
      if (server?.listening) {
        await new Promise<void>((resolve) => {
          const deadline = setTimeout(() => {
            for (const socket of sockets) socket.destroy()
          }, drainMs)
          server!.close(() => {
            clearTimeout(deadline)
            resolve()
          })
          for (const socket of upgrades) socket.destroy()
        })
      }
      proxy?.close()
      if (child && child.exitCode === null && child.signalCode === null) {
        const deadline = setTimeout(() => child!.kill('SIGKILL'), childMs)
        child.kill('SIGTERM')
        await childClosed
        clearTimeout(deadline)
      }
    })().finally(finish)
    return stopping
  }
  return {
    signal: controller.signal,
    finished,
    get failure() {
      return failure
    },
    stop,
    ownChild(value: ChildProcess) {
      child = value
      childClosed = new Promise<void>((resolve) => {
        child!.once('close', () => {
          if (!controller.signal.aborted) {
            failure = new Error('Application process exited unexpectedly')
            void stop()
          }
          resolve()
        })
      })
      child.once('error', (error) => {
        failure = error
        void stop()
      })
    },
    ownServer(value: Server, valueProxy?: httpProxy) {
      server = value
      proxy = valueProxy
      server.on('connection', (socket) => {
        sockets.add(socket)
        socket.once('close', () => {
          sockets.delete(socket)
          upgrades.delete(socket)
        })
      })
      server.on('upgrade', (_request, socket) => upgrades.add(socket))
    },
  }
}
