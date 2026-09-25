import { usePostHog } from '@posthog/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check, ChevronRight, Circle, Flag, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent } from '@/components/ui/popover'
import {
  availableOnboardingTasks,
  isTourTask,
  onboardingComplete,
  resolvedOnboardingTasks,
  type OnboardingProgress,
  type OnboardingProgressOperation,
  type OnboardingTaskId,
} from '../../../core/onboarding'
import { updateOnboardingProgress } from '../../../server/functions'
import { meQuery, onboardingQuery } from '../../queries'
import { useCompactChrome } from './useCompactChrome'
import {
  FIRST_ONBOARDING_STEP,
  ONBOARDING_ADVANCE_EVENT,
  ONBOARDING_EVENT,
  ONBOARDING_UI,
  focusAfterOnboardingNavigation,
  focusAfterOnboardingOperation,
  nextOnboardingFocus,
  onboardingFocusStorageKey,
  onboardingHrefFor,
  onboardingPage,
  onboardingPromptAtTop,
  onboardingStepEntry,
  onboardingStepPastAbsentTarget,
  onboardingTasks,
  storedOnboardingFocus,
  type OnboardingAdvanceEvent,
  type OnboardingFocus,
  type OnboardingPlacement,
  type OnboardingStepId,
} from './onboarding'

/** How long a step waits for its control to appear before the guide offers the page instead. */
const TARGET_WAIT = 1_500

const PLACEMENTS = {
  top: { side: 'top', align: 'center' },
  bottom: { side: 'bottom', align: 'center' },
  'bottom-end': { side: 'bottom', align: 'end' },
  left: { side: 'left', align: 'center' },
  right: { side: 'right', align: 'center' },
} as const satisfies Record<OnboardingPlacement, { side: 'top' | 'bottom' | 'left' | 'right'; align: 'start' | 'center' | 'end' }>

export function OnboardingGuide() {
  const { data: me } = useQuery(meQuery())
  return me ? <AccountOnboardingGuide key={me.id} userId={me.id} /> : null
}

function AccountOnboardingGuide({ userId }: { userId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const posthog = usePostHog()
  const queryClient = useQueryClient()
  const { data } = useQuery(onboardingQuery())
  const callUpdate = useServerFn(updateOnboardingProgress)
  const mutation = useMutation({
    mutationFn: (operation: OnboardingProgressOperation) => callUpdate({ data: operation }),
    onSuccess: (progress) => queryClient.setQueryData(onboardingQuery().queryKey, progress),
  })
  const updateProgress = useCallback((operation: OnboardingProgressOperation) => mutation.mutate(operation), [mutation])
  const storageKey = onboardingFocusStorageKey(userId)
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<OnboardingFocus | undefined>(() => storedOnboardingFocus(userId))
  const [target, setTarget] = useState<HTMLElement | undefined>()
  const [atTop, setAtTop] = useState(false)
  // Named rather than a flag: a step that has just moved on must not read the step before it as lost.
  const [lost, setLost] = useState<OnboardingStepId>()
  const compact = useCompactChrome()
  const page = onboardingPage(location.pathname)
  const visible = useMemo(() => (data ? availableOnboardingTasks(data) : []), [data])
  const focusedStep = focus ? ONBOARDING_UI[focus.step] : undefined

  const rememberFocus = useCallback(
    (next: OnboardingFocus | undefined) => {
      setFocus(next)
      if (next) sessionStorage.setItem(storageKey, JSON.stringify(next))
      else sessionStorage.removeItem(storageKey)
    },
    [storageKey],
  )

  const showStep = useCallback(
    async (next: OnboardingFocus) => {
      rememberFocus(next)
      const href = onboardingHrefFor(next.step, onboardingPage(location.pathname))
      if (href) await navigate({ href })
    },
    [location.pathname, navigate, rememberFocus],
  )

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(ONBOARDING_EVENT, show)
    return () => window.removeEventListener(ONBOARDING_EVENT, show)
  }, [])

  useEffect(() => {
    const advance = (event: Event) => {
      const next = nextOnboardingFocus(focus, (event as CustomEvent<OnboardingAdvanceEvent>).detail)
      if (next !== focus) rememberFocus(next)
    }
    window.addEventListener(ONBOARDING_ADVANCE_EVENT, advance)
    return () => window.removeEventListener(ONBOARDING_ADVANCE_EVENT, advance)
  }, [focus, rememberFocus])

  // Arriving on the next step's own page is the whole transition wherever a step changes page.
  useEffect(() => {
    const next = focusAfterOnboardingNavigation(focus, page)
    if (next !== focus) rememberFocus(next)
  }, [focus, page, rememberFocus])

  // A control the data need not produce is stepped over, rather than stranding the tour on a faction with no enhancements.
  useEffect(() => {
    if (!focus || lost !== focus.step) return
    const next = onboardingStepPastAbsentTarget(focus.step)
    if (next) void showStep({ task: focus.task, step: next })
  }, [focus, lost, showStep])

  // A task nobody can complete from the tooltip finishes when the server says the player did it.
  useEffect(() => {
    const next = focusedStep?.awaitsTask && focusedStep.next
    if (!focus || !next || !data?.completedTasks.includes(focus.task)) return
    rememberFocus({ task: focus.task, step: next })
  }, [data?.completedTasks, focus, focusedStep, rememberFocus])

  useEffect(() => {
    if (!focus || !focusedStep) {
      setTarget(undefined)
      setLost(undefined)
      return
    }
    const step = focus.step
    setLost(undefined)
    const selector = `[data-onboarding="${focusedStep.target}"]`
    let frame = 0
    let waited = 0
    const refresh = () => {
      frame = 0
      const element = [...document.querySelectorAll<HTMLElement>(selector)].find(
        (match) => match.getClientRects().length > 0 && !match.closest('[inert]'),
      )
      setTarget(element)
      setAtTop(onboardingPromptAtTop(element?.getBoundingClientRect().bottom, window.innerHeight))
      if (element) {
        // A control that goes away while the page settles is waited for again rather than given up on.
        clearTimeout(waited)
        waited = 0
        setLost(undefined)
      } else waited ||= window.setTimeout(() => setLost(step), TARGET_WAIT)
    }
    // One answer a frame: the roster builder rewrites this subtree constantly while it saves.
    const schedule = () => {
      frame ||= requestAnimationFrame(refresh)
    }
    refresh()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      clearTimeout(waited)
    }
  }, [focus, focusedStep, page])

  /*
   * A prompt either points at the control it describes or, where it cannot, sits
   * where the panel sits. Compact screens are the second case: a pane fills them,
   * so a popup beside it has nowhere to go, and `lost` is the control never arriving.
   */
  const prompted = !open && focusedStep ? (target ? (compact ? 'card' : 'anchor') : lost === focus?.step ? 'lost' : undefined) : undefined
  const anchored = prompted === 'anchor' ? target : undefined

  useEffect(() => {
    if (!target || !prompted || prompted === 'lost') return
    target.setAttribute('data-onboarding-active', 'true')
    return () => target.removeAttribute('data-onboarding-active')
  }, [prompted, target])

  useEffect(() => {
    if (!prompted || !focus) return
    posthog.capture('onboarding_task_viewed', { task: focus.task, step: focus.step })
  }, [focus, posthog, prompted])

  const dismiss = useCallback(() => {
    if (focus) posthog.capture('onboarding_task_paused', { task: focus.task, step: focus.step })
    rememberFocus(undefined)
  }, [focus, posthog, rememberFocus])

  useEffect(() => {
    if (!prompted) return
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && dismiss()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [dismiss, prompted])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next && data && !data.welcomed) updateProgress({ operation: 'welcome' })
  }

  const updateTask = (operation: OnboardingProgressOperation) => {
    const next = focusAfterOnboardingOperation(focus, operation)
    if (next !== focus) rememberFocus(next)
    updateProgress(operation)
  }

  const launch = async (task: OnboardingTaskId) => {
    if (!data?.welcomed) updateProgress({ operation: 'welcome' })
    setOpen(false)
    posthog.capture('onboarding_task_started', { task })
    // A tour the player left half-finished resumes where it stopped.
    await showStep(focus?.task === task ? focus : { task, step: FIRST_ONBOARDING_STEP[task] })
  }

  const finish = () => {
    if (focus && isTourTask(focus.task)) updateProgress({ operation: 'complete', task: focus.task })
    rememberFocus(undefined)
  }

  if (!data) return null

  const next = focusedStep?.next
  const prompt =
    focus && focusedStep ? (
      <GuidePrompt
        step={focusedStep}
        stranded={prompted === 'lost'}
        onDismiss={dismiss}
        onFinish={focusedStep.final ? finish : undefined}
        onAdvance={
          next && focusedStep.nextLabel
            ? { label: focusedStep.nextLabel, run: () => void showStep({ task: focusedStep.task, step: next }) }
            : undefined
        }
        onOpenPage={() => void showStep({ task: focusedStep.task, step: onboardingStepEntry(focus.step) })}
      />
    ) : null
  const placement = focusedStep ? PLACEMENTS[focusedStep.placement] : PLACEMENTS.bottom

  return (
    <>
      <GuidePanel
        data={data}
        visible={visible}
        open={open}
        busy={mutation.isPending}
        onClose={() => changeOpen(false)}
        onLaunch={launch}
        onUpdate={updateTask}
      />
      {anchored ? (
        <Popover open modal={false}>
          <PopoverContent
            ref={(element) => {
              // The portal is a child of `body`, where a compact roster pane makes every sibling inert.
              element?.closest('body > *')?.setAttribute('data-inert-exempt', '')
            }}
            anchor={anchored}
            side={placement.side}
            align={placement.align}
            sideOffset={10}
            initialFocus={false}
            finalFocus={false}
            className="w-[min(20rem,calc(100vw-2rem))] gap-0 border-2 border-info/50 bg-panel p-3 text-bone shadow-xl"
          >
            {prompt}
          </PopoverContent>
        </Popover>
      ) : null}
      {/* On `body` and above a dialog: a phone reads setup inside one, and a compact pane makes every sibling inert. */}
      {prompted === 'card' || prompted === 'lost'
        ? createPortal(
            <div
              data-inert-exempt
              className={`fixed inset-x-4 z-[60] mx-auto w-[min(20rem,calc(100vw-2rem))] border-2 border-info/50 bg-panel p-3 text-bone shadow-xl min-[860px]:inset-x-auto min-[860px]:top-auto min-[860px]:right-4 min-[860px]:bottom-4 ${
                atTop ? 'top-[calc(1rem+env(safe-area-inset-top))]' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))]'
              }`}
            >
              {prompt}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function GuidePrompt({
  step,
  stranded,
  onAdvance,
  onDismiss,
  onFinish,
  onOpenPage,
}: {
  step: (typeof ONBOARDING_UI)[OnboardingStepId]
  stranded: boolean
  onAdvance?: { label: string; run: () => void }
  onDismiss: () => void
  onFinish?: () => void
  onOpenPage: () => void
}) {
  return (
    <section role="note" aria-live="polite" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-info">Field guide</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-mt-2 -mr-2"
          aria-label="Close onboarding prompt"
          onClick={onDismiss}
        >
          <X />
        </Button>
      </div>
      <h2 className="font-semibold">{step.title}</h2>
      <p className="mt-1 text-xs leading-snug text-dim">{step.description}</p>
      {stranded ? (
        <Button type="button" size="sm" className="mt-3 w-full" onClick={onOpenPage}>
          Take me there <ChevronRight />
        </Button>
      ) : onAdvance ? (
        <Button type="button" size="sm" className="mt-3 w-full" onClick={onAdvance.run}>
          {onAdvance.label} <ChevronRight />
        </Button>
      ) : onFinish ? (
        <Button type="button" size="sm" className="mt-3 w-full" onClick={onFinish}>
          <Check /> Finish tour
        </Button>
      ) : null}
    </section>
  )
}

function GuidePanel({
  data,
  visible,
  open,
  busy,
  onClose,
  onLaunch,
  onUpdate,
}: {
  data: OnboardingProgress
  visible: OnboardingTaskId[]
  open: boolean
  busy: boolean
  onClose: () => void
  onLaunch: (task: OnboardingTaskId) => void
  onUpdate: (operation: OnboardingProgressOperation) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (open) heading.current?.focus()
  }, [open])
  if (!open) return null
  const resolved = resolvedOnboardingTasks(data)
  const complete = onboardingComplete(data)
  return (
    <dialog
      open
      aria-modal="false"
      aria-labelledby="onboarding-guide-title"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-50 flex max-h-[calc(100dvh-7rem)] w-auto flex-col overflow-hidden border border-edge bg-panel text-sm text-bone shadow-xl min-[860px]:bottom-4 min-[860px]:left-auto min-[860px]:max-h-[calc(100dvh-2rem)] min-[860px]:w-[32rem]"
    >
      <div className="relative border-b border-edge bg-sunken p-4 pr-12">
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-info">Getting started</p>
          <h2 id="onboarding-guide-title" ref={heading} tabIndex={-1} className="text-xl text-bone outline-none">
            {complete ? 'Field guide complete' : 'Learn Praetorium'}
          </h2>
          <p className="text-dim">
            {complete
              ? 'You have covered the essentials. Reopen any task whenever you want a reminder.'
              : 'Build, play, organize, and explore at your own pace. Your progress follows your account.'}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden bg-panel">
            <div className="h-full bg-info transition-[width]" style={{ width: `${(resolved.size / onboardingTasks.length) * 100}%` }} />
          </div>
          <p className="text-xs text-dim">
            {resolved.size} of {onboardingTasks.length} tasks resolved
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2"
          aria-label="Close getting started"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="grid min-h-0 gap-1 overflow-y-auto p-2">
        {onboardingTasks
          .filter((task) => visible.includes(task.id))
          .map((task) => {
            const completed = data.completedTasks.includes(task.id)
            const skipped = data.skippedTasks.includes(task.id)
            return (
              <div key={task.id} className="group flex items-center gap-1 border border-transparent hover:border-edge hover:bg-raised">
                <button type="button" className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left" onClick={() => onLaunch(task.id)}>
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
    </dialog>
  )
}
