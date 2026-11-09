import { useMutation } from '@tanstack/react-query'
import { PencilLine } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { reportTableResult } from '../../functions'
import { useStartBattle } from '../battles/useStartBattle'
import { useSealedEventRefresh } from './sealedEvent'

const validScore = (text: string) => /^\d{1,3}$/.test(text)

/** Records a table's final score for a game that wasn't tracked here, as at a venue without a phone at every table. */
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
  const [open, setOpen] = useState(false)
  const [scores, setScores] = useState(['', ''])
  const refresh = useSealedEventRefresh(token)
  const { defaultMissionPackId } = useStartBattle()
  const report = useMutation({
    mutationFn: async () =>
      reportTableResult({
        data: {
          token,
          eventToken,
          round,
          table,
          vp: [Number(scores[0]), Number(scores[1])],
          missionPackId: await defaultMissionPackId(),
        },
      }),
    onSuccess: async () => {
      await refresh()
      setOpen(false)
    },
  })
  return (
    <>
      <Button variant="ghost" size="sm" className="shrink-0" aria-label={`Enter score for table ${table}`} onClick={() => setOpen(true)}>
        <PencilLine /> Enter score
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Table {table} score</DialogTitle>
            <DialogDescription>
              For a game that wasn’t tracked here. It counts for this tournament’s standings but not the leaderboard.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {names.map((name, at) => (
              <div key={at} className="space-y-1.5">
                <Label htmlFor={`table-${table}-score-${at}`}>{name}</Label>
                <Input
                  id={`table-${table}-score-${at}`}
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
