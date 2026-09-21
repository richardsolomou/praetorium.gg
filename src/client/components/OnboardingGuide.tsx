import { usePostHog } from '@posthog/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check, Circle, Flag, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EVENTS, Joyride, type EventData, type Step, type TooltipRenderProps } from 'react-joyride'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  availableOnboardingTasks,
  onboardingTasks,
  type OnboardingProgress,
  type OnboardingProgressOperation,
  type OnboardingTask,
  type OnboardingTaskId,
} from '../../core/onboarding'
import { updateOnboardingProgress } from '../../server/functions'
import { meQuery, onboardingQuery } from '../queries'
import {
  FIRST_ONBOARDING_STEP,
  ONBOARDING_ADVANCE_EVENT,
  ONBOARDING_EVENT,
  ONBOARDING_PROGRESS_EVENT,
  ONBOARDING_UI,
  canOfferOnboardingWelcome,
  focusAfterOnboardingOperation,
  nextOnboardingFocus,
  onboardingPage,
  onboardingStepIds,
  signalOnboardingProgress,
  type OnboardingAdvanceEvent,
  type OnboardingFocus,
  type OnboardingProgressEvent,
} from '../onboarding'

type GuideStepData = { task: OnboardingTask; dismiss: () => void; finish?: () => void }

const focusedTaskKey = 'praetorium:focused-onboarding-step'

function storedFocus(): OnboardingFocus | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = JSON.parse(sessionStorage.getItem(focusedTaskKey) ?? 'null') as Partial<OnboardingFocus> | null
    const task = onboardingTasks.find((candidate) => candidate.id === stored?.task)?.id
    const step = onboardingStepIds.find((candidate) => candidate === stored?.step)
    return task && step && ONBOARDING_UI[step].task === task ? { task, step } : undefined
  } catch {
    return undefined
  }
}

export function OnboardingGuide() {
  const location = useLocation()
  const navigate = useNavigate()
  const posthog = usePostHog()
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const { data } = useQuery({ ...onboardingQuery(), enabled: Boolean(me) })
  const callUpdate = useServerFn(updateOnboardingProgress)
  const mutation = useMutation({
    mutationFn: (operation: OnboardingProgressOperation) => callUpdate({ data: operation }),
    onSuccess: (progress) => queryClient.setQueryData(onboardingQuery().queryKey, progress),
  })
  const updateProgress = useCallback((operation: OnboardingProgressOperation) => mutation.mutate(operation), [mutation])
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<OnboardingFocus | undefined>(storedFocus)
  const [target, setTarget] = useState<{ element: HTMLElement; revision: number } | undefined>()
  const [compactGuide, setCompactGuide] = useState(false)
  const offeredWelcome = useRef(false)
  const page = onboardingPage(location.pathname)
  const visible = useMemo(() => (data ? availableOnboardingTasks(data) : []), [data])
  const resolved = data ? new Set([...data.completedTasks, ...data.skippedTasks]) : new Set<OnboardingTaskId>()
  const complete = resolved.size === onboardingTasks.length

  useLayoutEffect(() => {
    const compact = window.matchMedia('(max-width: 859px)')
    const sync = () => setCompactGuide(compact.matches || document.documentElement.dataset.nativeApp === 'true')
    sync()
    compact.addEventListener('change', sync)
    return () => compact.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(ONBOARDING_EVENT, show)
    return () => window.removeEventListener(ONBOARDING_EVENT, show)
  }, [])

  useEffect(() => {
    if (!data || data.welcomed || offeredWelcome.current || !canOfferOnboardingWelcome(location.pathname)) return
    offeredWelcome.current = true
    setOpen(true)
  }, [data, location.pathname])

  useEffect(() => {
    const completeTask = (event: Event) => {
      const { task, keepGuide } = (event as CustomEvent<OnboardingProgressEvent>).detail
      setFocus((current) => {
        if (keepGuide || current?.task !== task) return current
        sessionStorage.removeItem(focusedTaskKey)
        return undefined
      })
      if (!data?.completedTasks.includes(task)) updateProgress({ operation: 'complete', task })
    }
    window.addEventListener(ONBOARDING_PROGRESS_EVENT, completeTask)
    return () => window.removeEventListener(ONBOARDING_PROGRESS_EVENT, completeTask)
  }, [data?.completedTasks, updateProgress])

  useEffect(() => {
    const advance = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingAdvanceEvent>).detail
      setFocus((current) => {
        const next = nextOnboardingFocus(current, detail)
        if (next !== current) sessionStorage.setItem(focusedTaskKey, JSON.stringify(next))
        return next
      })
    }
    window.addEventListener(ONBOARDING_ADVANCE_EVENT, advance)
    return () => window.removeEventListener(ONBOARDING_ADVANCE_EVENT, advance)
  }, [])

  const focusedTask = focus && visible.find((task) => task.id === focus.task)
  const focusedStep = focus ? ONBOARDING_UI[focus.step] : undefined
  const candidate = useMemo(
    () =>
      focusedTask && focusedStep?.task === focusedTask.id && focusedStep.page === page ? { task: focusedTask, ui: focusedStep } : undefined,
    [focusedStep, focusedTask, page],
  )

  useEffect(() => {
    if (!candidate) {
      setTarget(undefined)
      return
    }
    const selector = `[data-onboarding="${candidate.ui.target}"]`
    const refresh = () => {
      const element = [...document.querySelectorAll<HTMLElement>(selector)].find(
        (match) => match.getClientRects().length > 0 && !match.closest('[inert]'),
      )
      setTarget((current) => {
        if (!element) return undefined
        return current?.element === element ? current : { element, revision: (current?.revision ?? 0) + 1 }
      })
    }
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { attributes: true, childList: true, subtree: true })
    return () => observer.disconnect()
  }, [candidate])

  const active = target ? candidate : undefined
  const step = useMemo<Step | undefined>(() => {
    if (!active || !target) return undefined
    return {
      id: focus?.step,
      target: target.element,
      title: active.ui.title,
      content: active.ui.description,
      placement: compactGuide ? 'center' : active.ui.placement,
      data: {
        task: active.task,
        dismiss: () => {
          posthog.capture('onboarding_task_paused', { task: active.task.id, step: focus?.step })
          setFocus(undefined)
          sessionStorage.removeItem(focusedTaskKey)
        },
        finish: active.ui.final
          ? () => {
              posthog.capture('onboarding_task_completed', { task: active.task.id })
              signalOnboardingProgress(active.task.id)
            }
          : undefined,
      } satisfies GuideStepData,
    }
  }, [active, compactGuide, focus?.step, posthog, target])

  useEffect(() => {
    const element = !open && active ? target?.element : null
    element?.setAttribute('data-onboarding-active', 'true')
    return () => element?.removeAttribute('data-onboarding-active')
  }, [active, open, target])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next && data && !data.welcomed) updateProgress({ operation: 'welcome' })
  }

  const updateTask = (operation: OnboardingProgressOperation) => {
    setFocus((current) => {
      const next = focusAfterOnboardingOperation(current, operation)
      if (current && !next) sessionStorage.removeItem(focusedTaskKey)
      return next
    })
    updateProgress(operation)
  }

  const launch = async (task: OnboardingTask) => {
    if (!data?.welcomed) updateProgress({ operation: 'welcome' })
    setOpen(false)
    const next = { task: task.id, step: FIRST_ONBOARDING_STEP[task.id] }
    setFocus(next)
    sessionStorage.setItem(focusedTaskKey, JSON.stringify(next))
    posthog.capture('onboarding_task_started', { task: task.id })
    const destination = ONBOARDING_UI[next.step].page
    if (destination === 'friends') await navigate({ to: '/friends' })
    else if (destination === 'rosters') await navigate({ to: '/rosters' })
    else await navigate({ to: '/battles' })
  }

  if (!me || !data) return null

  return (
    <>
      {!complete && !candidate ? (
        <button
          type="button"
          data-onboarding-launcher
          className="fixed right-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-40 grid size-11 place-items-center rounded-full border-2 border-info/50 bg-panel text-info shadow-lg transition-colors hover:bg-raised hover:text-parchment min-[860px]:bottom-4"
          aria-label={`Getting started, ${resolved.size} of ${onboardingTasks.length} tasks resolved`}
          onClick={() => setOpen(true)}
        >
          <Flag className="size-5" />
          <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-info ring-2 ring-panel" />
        </button>
      ) : null}
      <GuideDialog
        data={data}
        visible={visible}
        open={open}
        busy={mutation.isPending}
        onOpenChange={changeOpen}
        onLaunch={launch}
        onUpdate={updateTask}
      />
      {step && !open ? (
        <Joyride
          key={`${page}:${step.id}:${target?.revision}`}
          run
          steps={[step]}
          loaderComponent={null}
          onEvent={(event: EventData) => {
            if (event.type === EVENTS.TOOLTIP) posthog.capture('onboarding_task_viewed', { task: active?.task.id, step: step.id })
          }}
          tooltipComponent={GuideTooltip}
          options={{
            blockTargetInteraction: false,
            buttons: [],
            disableFocusTrap: true,
            dismissKeyAction: false,
            hideOverlay: true,
            overlayClickAction: false,
            skipBeacon: true,
            spotlightPadding: 6,
            spotlightRadius: 2,
            targetWaitTimeout: 2_000,
            zIndex: 70,
          }}
        />
      ) : null}
    </>
  )
}

function GuideDialog({
  data,
  visible,
  open,
  busy,
  onOpenChange,
  onLaunch,
  onUpdate,
}: {
  data: OnboardingProgress
  visible: OnboardingTask[]
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onLaunch: (task: OnboardingTask) => void
  onUpdate: (operation: OnboardingProgressOperation) => void
}) {
  const resolved = new Set([...data.completedTasks, ...data.skippedTasks])
  const complete = resolved.size === onboardingTasks.length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-edge bg-sunken p-4 pr-12">
          <p className="eyebrow text-info">Getting started</p>
          <DialogTitle className="text-xl text-bone">{complete ? 'Ready for battle' : 'Learn Praetorium at the table'}</DialogTitle>
          <DialogDescription>
            {complete
              ? 'You have covered the essentials. Reopen any task whenever you want a reminder.'
              : 'Praetorium takes you from army list to final score. Complete these tasks in your own order; your progress follows your account.'}
          </DialogDescription>
          <div className="mt-1 h-1.5 overflow-hidden bg-panel">
            <div className="h-full bg-info transition-[width]" style={{ width: `${(resolved.size / onboardingTasks.length) * 100}%` }} />
          </div>
          <p className="text-xs text-dim">
            {resolved.size} of {onboardingTasks.length} tasks resolved
          </p>
        </DialogHeader>
        <div className="grid gap-1 p-2">
          {visible.map((task) => {
            const completed = data.completedTasks.includes(task.id)
            const skipped = data.skippedTasks.includes(task.id)
            return (
              <div key={task.id} className="group flex items-center gap-1 border border-transparent hover:border-edge hover:bg-raised">
                <button type="button" className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left" onClick={() => onLaunch(task)}>
                  {completed ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-info" />
                  ) : skipped ? (
                    <Circle className="mt-0.5 size-4 shrink-0 text-faint" />
                  ) : (
                    <Flag className="mt-0.5 size-4 shrink-0 text-info" />
                  )}
                  <span className="min-w-0">
                    <span className={`block font-semibold ${completed || skipped ? 'text-dim line-through' : 'text-bone'}`}>
                      {task.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-dim">
                      {completed ? 'Complete · Review this task' : skipped ? 'Skipped' : task.description}
                    </span>
                  </span>
                </button>
                {skipped ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mr-2"
                    disabled={busy}
                    aria-label={`Restore ${task.title}`}
                    onClick={() => onUpdate({ operation: 'restore', task: task.id })}
                  >
                    <RotateCcw />
                  </Button>
                ) : !completed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mr-1 text-xs text-dim"
                    disabled={busy}
                    aria-label={`Skip ${task.title}`}
                    onClick={() => onUpdate({ operation: 'skip', task: task.id })}
                  >
                    Skip
                  </Button>
                ) : null}
              </div>
            )
          })}
          {!complete && visible.length < onboardingTasks.length ? (
            <p className="px-3 py-2 text-xs text-dim">More guidance appears after you resolve the preparation tasks.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GuideTooltip({ closeProps, step, tooltipProps }: TooltipRenderProps) {
  const { dismiss, finish } = step.data as GuideStepData
  return (
    <section
      {...tooltipProps}
      data-onboarding-overlay
      role="note"
      aria-live="polite"
      aria-label="Getting started"
      className="pointer-events-none w-[min(20rem,calc(100vw-2rem))] border-2 border-info/50 bg-panel p-3 text-bone shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-info">Field guide</p>
        <Button
          {...closeProps}
          type="button"
          variant="ghost"
          size="icon-sm"
          className="pointer-events-auto -mt-2 -mr-2"
          aria-label="Close onboarding prompt"
          onClick={(event) => {
            closeProps.onClick(event)
            dismiss()
          }}
        >
          <X />
        </Button>
      </div>
      <h2 className="font-semibold">{step.title}</h2>
      <p className="mt-1 text-xs leading-snug text-dim">{step.content}</p>
      {finish ? (
        <Button
          {...closeProps}
          type="button"
          size="sm"
          className="pointer-events-auto mt-3 w-full"
          onClick={(event) => {
            closeProps.onClick(event)
            finish()
          }}
        >
          <Check /> Finish roster tour
        </Button>
      ) : null}
    </section>
  )
}
