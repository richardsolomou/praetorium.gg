import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { version } from '../../../../package.json'
import {
  publicSupportPayload,
  supportDraftSchema,
  supportIssueUrl,
  type SupportDraft,
  type SupportRecord,
} from '../../../core/supportReport'
import { Choice } from '../../components/Choice'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { checkSupportReport, ownSupportReports, submitSupportReport, supportAvailability } from '../../functions'
import { meQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const DELIVERY = {
  sending: 'Unconfirmed',
  uncertain: 'Unconfirmed',
  refused: 'Not sent',
  received: 'Received',
}
const PAGE_NAMES: Record<SupportDraft['page'], string> = {
  support: 'Support',
  rosters: 'Rosters',
  battle: 'Battle',
  reference: 'Rules reference',
  league: 'League',
  simulator: 'Simulator',
  account: 'Account',
  other: 'Other',
}

export function SupportReports({ page }: { page: SupportDraft['page'] }) {
  const { data: me } = useQuery(meQuery())
  const availability = useQuery({ queryKey: ['support-availability'], queryFn: () => supportAvailability() })
  return (
    <section className="ph-no-capture space-y-4" aria-labelledby="support-reports-heading">
      <h2 id="support-reports-heading" className="text-lg">
        Report a problem
      </h2>
      <p className="text-sm text-dim">
        Reports and replies are public on GitHub. Keep account, privacy and deletion requests out of this form.
      </p>
      {availability.isError ? <p role="alert">Reporting availability could not be checked. Refresh to try again.</p> : null}
      {availability.data && !availability.data.configured ? (
        <p className="text-sm text-dim">In-app reporting is unavailable. You can still use the public issue tracker below.</p>
      ) : null}
      {!me ? (
        <Link to="/sign-in" search={{ next: '/support' }} className="text-info">
          Sign in to submit and follow your reports
        </Link>
      ) : (
        <PlayerSupport key={me.id} userId={me.id} page={page} available={Boolean(availability.data?.configured)} />
      )}
    </section>
  )
}

function PlayerSupport({ userId, page, available }: { userId: string; page: SupportDraft['page']; available: boolean }) {
  const queryClient = useQueryClient()
  const queryKey = ['support-reports', userId]
  const reports = useQuery({ queryKey, queryFn: () => ownSupportReports(), retry: false })
  const [draft, setDraft] = useState<SupportDraft>(() => ({
    reference: '',
    kind: 'bug',
    title: '',
    description: '',
    page,
    appVersion: version,
    rulesVersion: '',
    attachment: '',
  }))
  const [review, setReview] = useState(false)
  const [consent, setConsent] = useState(false)
  const [validation, setValidation] = useState('')
  const [submitted, setSubmitted] = useState<SupportRecord | null>(null)
  const [attempted, setAttempted] = useState(false)
  const reconcileReport = (record: SupportRecord) => {
    queryClient.setQueryData<SupportRecord[]>(queryKey, (current) =>
      current?.map((entry) => (entry.reference === record.reference ? record : entry)),
    )
    setSubmitted((current) => (current?.reference === record.reference ? record : current))
  }
  const submit = useMutation({
    mutationFn: () => {
      setAttempted(true)
      return submitSupportReport({ data: { ...draft, publishPublicly: true } })
    },
    retry: false,
    onSuccess: async (record) => {
      setSubmitted(record)
      setReview(false)
      setConsent(false)
      await queryClient.invalidateQueries({ queryKey })
    },
  })
  const payload = publicSupportPayload(draft)
  const update = <K extends keyof SupportDraft>(key: K, value: SupportDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setConsent(false)
  }
  function reviewReport() {
    const candidate = { ...draft, reference: draft.reference || crypto.randomUUID() }
    const result = supportDraftSchema.safeParse(candidate)
    if (!result.success) {
      setValidation(
        'Use a title of 3–160 characters and a description of 10–8,000 characters. Text attachments are limited to 8,000 characters.',
      )
      return
    }
    setDraft(result.data)
    setValidation('')
    setConsent(false)
    setReview(true)
  }
  return (
    <div className="space-y-6">
      {!submitted ? (
        <fieldset className="space-y-4" disabled={attempted}>
          <Choice
            label="Report type"
            value={draft.kind}
            options={[
              { value: 'bug', name: 'Bug' },
              { value: 'rules-data', name: 'Rules / data' },
              { value: 'suggestion', name: 'Suggestion' },
            ]}
            onChange={(value) => update('kind', value)}
          />
          <label htmlFor="support-title" className="block space-y-1 text-sm">
            Title
            <Input id="support-title" value={draft.title} maxLength={160} onChange={(event) => update('title', event.target.value)} />
          </label>
          <label htmlFor="support-description" className="block space-y-1 text-sm">
            What happened or what would help?
            <Textarea
              id="support-description"
              value={draft.description}
              maxLength={8_000}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
          <label htmlFor="support-page" className="block space-y-1 text-sm">
            Page
            <select
              id="support-page"
              className="block w-full border border-edge bg-panel p-2"
              value={draft.page}
              onChange={(event) => update('page', event.target.value as SupportDraft['page'])}
            >
              {Object.entries(PAGE_NAMES).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="support-rules-version" className="block space-y-1 text-sm">
            Rules version (optional)
            <Input
              id="support-rules-version"
              value={draft.rulesVersion}
              maxLength={120}
              onChange={(event) => update('rulesVersion', event.target.value)}
            />
          </label>
          <label htmlFor="support-attachment" className="block space-y-1 text-sm">
            Public text attachment (optional)
            <Textarea
              id="support-attachment"
              value={draft.attachment}
              maxLength={8_000}
              onChange={(event) => update('attachment', event.target.value)}
            />
          </label>
          <p className="text-xs text-dim">
            Only the text you review is included. No roster, battle, account details, page link or screenshot is attached automatically.
          </p>
          {validation ? (
            <p role="alert" className="text-sm text-destructive">
              {validation}
            </p>
          ) : null}
        </fieldset>
      ) : (
        <div className="space-y-2">
          <output className="block text-sm">
            {submitted.delivery === 'received'
              ? 'GitHub received your report. This does not mean the problem is resolved.'
              : submitted.delivery === 'refused'
                ? 'GitHub refused delivery. Your report was not sent.'
                : 'Delivery is not confirmed. Check this report before sending anything else.'}
          </output>
          {submitted.delivery === 'received' || submitted.delivery === 'refused' ? (
            <Button
              variant="outline"
              onClick={() => {
                setSubmitted(null)
                setDraft({
                  reference: '',
                  kind: 'bug',
                  title: '',
                  description: '',
                  page,
                  appVersion: version,
                  rulesVersion: '',
                  attachment: '',
                })
                submit.reset()
                setAttempted(false)
              }}
            >
              New report
            </Button>
          ) : null}
        </div>
      )}
      {!submitted ? <Button onClick={reviewReport}>Review public report</Button> : null}
      <Dialog
        open={review}
        onOpenChange={(open) => {
          if (!submit.isPending) {
            setReview(open)
            setConsent(false)
          }
        }}
      >
        <DialogContent size="md" className="ph-no-capture" showCloseButton={!submit.isPending}>
          <DialogHeader>
            <DialogTitle>Review public report</DialogTitle>
            <DialogDescription>This exact title and body will be published in the public praetorium.gg issue tracker.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="font-semibold wrap-anywhere">{payload.title}</p>
            <pre className="whitespace-pre-wrap font-rules text-sm wrap-anywhere">{payload.body}</pre>
            <p className="text-sm text-dim">
              Do not publish private roster links, secret missions, personal information, passwords or recovery codes. Public issues can be
              copied and may remain after account deletion.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} disabled={submit.isPending} onChange={(event) => setConsent(event.target.checked)} />
              I agree to publish all of this report and its text attachment publicly.
            </label>
            {submit.isError ? (
              <p role="alert" className="text-sm text-destructive">
                The response was not received. Retry this same report; its reference will be checked before another delivery.{' '}
                {errorMessage(submit.error)}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={submit.isPending}
              onClick={() => {
                setReview(false)
                setConsent(false)
              }}
            >
              Cancel
            </Button>
            <Button disabled={!consent || submit.isPending || !available} onClick={() => submit.mutate()}>
              {submit.isPending ? 'Sending…' : 'Publish public report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="space-y-3">
        <h3 className="text-base">Your reports</h3>
        {reports.isPending ? <p className="text-sm text-dim">Loading reports…</p> : null}
        {reports.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Your reports could not be loaded.{' '}
            <button className="text-info" onClick={() => void reports.refetch()}>
              Try again
            </button>
          </p>
        ) : null}
        {reports.data?.length === 0 ? <p className="text-sm text-dim">No reports yet.</p> : null}
        {reports.data?.map((record) => (
          <Report key={record.reference} record={record} onReconciled={reconcileReport} />
        ))}
      </div>
    </div>
  )
}

function Report({ record, onReconciled }: { record: SupportRecord; onReconciled: (record: SupportRecord) => void }) {
  const [page, setPage] = useState(1)
  const [read, setRead] = useState<Awaited<ReturnType<typeof checkSupportReport>> | null>(null)
  const check = useMutation({
    mutationFn: (next: number) => checkSupportReport({ data: { reference: record.reference, page: next } }),
    retry: false,
    onSuccess: (result, next) => {
      onReconciled(result.record)
      if (result.checked) {
        setRead(result)
        setPage(next)
      }
    },
  })
  const current = read?.record ?? record
  const status = read?.issue
  return (
    <article className="space-y-2 border border-edge p-3 text-sm">
      <h4 className="font-semibold wrap-anywhere">{current.title}</h4>
      <p>
        {status ? (status.state === 'open' ? 'Open' : status.reason === 'completed' ? 'Resolved' : 'Closed') : DELIVERY[current.delivery]}
      </p>
      <p className="text-xs text-dim wrap-anywhere">Report reference: {current.reference}</p>
      {current.delivery === 'sending' || current.delivery === 'uncertain' ? (
        <p className="text-xs text-dim">
          GitHub may have received this report. Checking will look for it and will not publish another copy.
        </p>
      ) : null}
      {current.delivery === 'refused' ? <p className="text-xs text-dim">GitHub refused delivery. The report was not received.</p> : null}
      {current.issueNumber ? (
        <a className="text-info" href={supportIssueUrl(current.issueNumber)} target="_blank" rel="noreferrer noopener">
          View public issue #{current.issueNumber}
        </a>
      ) : null}
      <Button size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate(page)}>
        {check.isPending ? 'Checking…' : 'Check status and replies'}
      </Button>
      {check.data && !check.data.checked ? (
        <output className="block text-xs text-dim">Wait 30 seconds between checks. Reporting must be available to read replies.</output>
      ) : null}
      {check.isError ? (
        <p role="alert" className="text-destructive">
          Replies could not be read. Try again after 30 seconds.
        </p>
      ) : null}
      {read?.replies.map((reply) => (
        <div key={reply.id} className="space-y-1 border-t border-edge pt-2">
          <p className="text-xs text-dim">
            {reply.author} · {reply.at}
          </p>
          <p className="whitespace-pre-wrap wrap-anywhere">{reply.body}</p>
        </div>
      ))}
      {read?.more ? (
        <Button
          size="sm"
          variant="outline"
          disabled={check.isPending}
          onClick={() => {
            check.mutate(page + 1)
          }}
        >
          Next replies
        </Button>
      ) : null}
    </article>
  )
}
