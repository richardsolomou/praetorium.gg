import { createServer, type Server } from 'node:net'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

export async function reserveLocalPort(requested = 0, fallback = false) {
  if (!Number.isInteger(requested) || requested < 0 || requested > 65_535) throw new Error('Invalid local port')
  const server = createServer((socket) => socket.destroy())
  try {
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(requested, '0.0.0.0', resolve))
  } catch (error) {
    if (fallback && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') return reserveLocalPort()
    throw new Error(`Local port ${requested} is unavailable`, { cause: error })
  }
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local port has no address')
  return { port: address.port, release: () => closeServer(server) }
}

export async function closeServer(server: Server) {
  if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

export async function localTestEnvironment(kind: 'e2e' | 'native-auth-ios', environment: NodeJS.ProcessEnv = process.env) {
  const ports: Awaited<ReturnType<typeof reserveLocalPort>>[] = []
  try {
    for (const name of ['PLAYWRIGHT_PORT', 'PLAYWRIGHT_INTERNAL_PORT', 'PLAYWRIGHT_SPACETIME_PORT', 'PLAYWRIGHT_READY_PORT']) {
      ports.push(await reserveLocalPort(environment[name] === undefined ? 0 : Number(environment[name])))
    }
    return {
      PLAYWRIGHT_PORT: String(ports[0]!.port),
      PLAYWRIGHT_INTERNAL_PORT: String(ports[1]!.port),
      PLAYWRIGHT_SPACETIME_PORT: String(ports[2]!.port),
      PLAYWRIGHT_READY_PORT: String(ports[3]!.port),
      PLAYWRIGHT_DATA_ROOT: environment.PLAYWRIGHT_DATA_ROOT ?? `/tmp/praetorium-${kind}-${randomUUID()}`,
    }
  } finally {
    await Promise.all(ports.map((reservation) => reservation.release()))
  }
}

export function startLocalChild(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  return spawn(command, args, { env: environment, stdio: 'inherit', detached: process.platform !== 'win32' })
}

function signalChild(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return
    if (code === 'EPERM' && process.platform === 'darwin' && (child.exitCode !== null || child.signalCode !== null)) {
      const groups = execFileSync('ps', ['-axo', 'pgid=,stat='], { encoding: 'utf8' })
      const live = groups.split('\n').some((line) => {
        const [group, state] = line.trim().split(/\s+/)
        return Number(group) === child.pid && !state?.startsWith('Z')
      })
      if (!live) return
    }
    throw new Error(`Could not send ${signal} to local child ${child.pid}.`, { cause: error })
  }
}

function childExit(child: ChildProcess) {
  return !child.pid || child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) => child.once('exit', () => resolve()))
}

const stoppedChildren = new WeakSet<ChildProcess>()

export async function stopLocalChildren(children: readonly ChildProcess[]) {
  children = children.filter((child) => !stoppedChildren.has(child))
  for (const child of children) signalChild(child, 'SIGTERM')
  const exited = Promise.all(children.map(childExit))
  const timeout = new AbortController()
  try {
    await Promise.race([exited, delay(5_000, undefined, { signal: timeout.signal })])
  } finally {
    timeout.abort()
  }
  for (const child of children) signalChild(child, 'SIGKILL')
  await exited
  for (const child of children) stoppedChildren.add(child)
}
