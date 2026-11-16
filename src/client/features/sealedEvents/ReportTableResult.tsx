import { useMutation } from '@tanstack/react-query'
import { PencilLine } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { reportTableResult } from '../../functions'
import { useStartBattle } from '../battles/useStartBattle'
import { useSealedEventRefresh } from './sealedEvent'

const validScore = (text: string) => /^\d{1,3}$/.test(text)

/** Records a game's final score when it wasn't tracked here, as at a venue without a phone at every table. */
export function EnterScore({
  title,
  label,
  description,
  names,
  save,
}: {
  title: string
  label: string
  description: string
  names: [ReactNode, ReactNode]
  save: (vp: [number, number], missionPackId: string | null) => Promise<unknown>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [scores, setScores] = useState(['', ''])
  const { defaultMissionPackId } = useStartBattle()
  const report = useMutation({
    mutationFn: async () => save([Number(scores[0]), Number(scores[1])], await defaultMissionPackId()),
    onSuccess: () => setOpen(false),
  })
  return (
    <>
      <Button variant="ghost" size="sm" className="shrink-0" aria-label={label} onClick={() => setOpen(true)}>
        <PencilLine /> Enter score
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {([0, 1] as const).map((at) => (
              <div key={at} className="space-y-1.5">
                <Label htmlFor={`${id}-${at}`}>{names[at]}</Label>
                <Input
                  id={`${id}-${at}`}
                  inputMode="numeric"
                  value={scores[at]}
                  onChange={(event) => setScores(scores.map((score, index) => (index === at ? event.target.value : score)))}
                />
              </div>
            ))}
            {report.error ? <Problem error={report.error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button disabled={report.isPending || !scores.every(validScore)} onClick={() => report.mutate()}>
              {report.isPending ? 'Saving…' : 'Save score'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A tournament table's score, for a game that wasn't tracked here. */
export function ReportTableResult({
  token,
  eventToken,
  round,
  table,
  names,
}: {
  token: string
  eventToken: string
  round: number
  table: number
  names: [ReactNode, ReactNode]
}) {
  const refresh = useSealedEventRefresh(token)
  return (
    <EnterScore
      title={`Table ${table} score`}
      label={`Enter score for table ${table}`}
      description="For a game that wasn’t tracked here. It counts for this tournament’s standings but not the leaderboard."
      names={names}
      save={async (vp, missionPackId) => {
        await reportTableResult({ data: { token, eventToken, round, table, vp, missionPackId } })
        await refresh()
      }}
    />
  )
}
