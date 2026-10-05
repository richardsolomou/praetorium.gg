import type { AgentToolDescriptor } from '../../../contracts/agentTools'

export type WriteProposal = {
  tool: AgentToolDescriptor
  input: Record<string, unknown>
  summary: string
  status: 'review' | 'saving' | 'failed'
  error: string | null
}

export class WriteApproval {
  proposal: WriteProposal | null = null
  private settle: ((approved: boolean) => void) | null = null

  constructor(private readonly changed: (proposal: WriteProposal | null) => void) {}

  request(tool: AgentToolDescriptor, input: Record<string, unknown>, summary: string, signal: AbortSignal): Promise<boolean> {
    if (this.proposal || signal.aborted) return Promise.resolve(false)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => this.dismiss(), 120_000)
      const cancel = () => this.dismiss()
      this.settle = (approved) => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', cancel)
        this.settle = null
        resolve(approved)
      }
      signal.addEventListener('abort', cancel, { once: true })
      this.update({ tool, input, summary, status: 'review', error: null })
    })
  }

  approve() {
    if (!this.settle || this.proposal?.status !== 'review') return
    this.update({ ...this.proposal, status: 'saving' })
    this.settle(true)
  }

  dismiss() {
    this.settle?.(false)
    this.update(null)
  }

  finish(error: string | null) {
    if (error && this.proposal) this.update({ ...this.proposal, status: 'failed', error })
    else this.update(null)
  }

  private update(proposal: WriteProposal | null) {
    this.proposal = proposal
    this.changed(proposal)
  }
}
