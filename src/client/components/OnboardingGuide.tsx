import { usePostHog } from '@posthog/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Check, ChevronRight, Circle, Flag, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EVENTS, Joyride, type EventData, type Step, type TooltipRenderProps } from 'react-joyride'
import { Button } from '@/components/ui/button'
import {
  availableOnboardingTasks,
  onboardingTasks,
  type OnboardingProgress,
  type OnboardingProgressOperation,
  type OnboardingTask,
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
  onboardingFocusStorageKey,
  onboardingPage,
  signalOnboardingProgress,
  storedOnboardingFocus,
  type OnboardingAdvanceEvent,
  type OnboardingFocus,
  type OnboardingProgressEvent,
} from '../onboarding'

type GuideStepData = {
  task: OnboardingTask
  dismiss: () => void
  advance?: { label: string; run: () => void }
  finish?: () => void
}

export function OnboardingGuide() {
  const { data: me } = useQuery(meQuery())
  return me ? <AccountOnboardingGuide key={me.id} userId={me.id} /> : null
}

function AccountOnboardingGuide({ userId }: { userId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const posthog = usePostHog()
  const queryClient = useQueryClient()
  const { data } = useQuery(onboardingQuery(userId))
  const callUpdate = useServerFn(updateOnboardingProgress)
  const mutation = useMutation({
    mutationFn: (operation: OnboardingProgressOperation) => callUpdate({ data: operation }),
    onSuccess: (progress) => queryClient.setQueryData(onboardingQuery(userId).queryKey, progress),
  })
  const updateProgress = useCallback((operation: OnboardingProgressOperation) => mutation.mutate(operation), [mutation])
  const storageKey = onboardingFocusStorageKey(userId)
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<OnboardingFocus | undefined>(() => storedOnboardingFocus(userId))
  const [target, setTarget] = useState<{ element: HTMLElement; revision: number } | undefined>()
  const [compactGuide, setCompactGuide] = useState(false)
  const offeredWelcome = useRef(false)
  const page = onboardingPage(location.pathname)
  const visible = useMemo(() => (data ? availableOnboardingTasks(data) : []), [data])

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
        sessionStorage.removeItem(storageKey)
        return undefined
      })
      if (!data?.completedTasks.includes(task)) updateProgress({ operation: 'complete', task })
    }
    window.addEventListener(ONBOARDING_PROGRESS_EVENT, completeTask)
    return () => window.removeEventListener(ONBOARDING_PROGRESS_EVENT, completeTask)
  }, [data?.completedTasks, storageKey, updateProgress])

  useEffect(() => {
    const advance = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingAdvanceEvent>).detail
      setFocus((current) => {
        const next = nextOnboardingFocus(current, detail)
        if (next !== current) sessionStorage.setItem(storageKey, JSON.stringify(next))
        return next
      })
    }
    window.addEventListener(ONBOARDING_ADVANCE_EVENT, advance)
    return () => window.removeEventListener(ONBOARDING_ADVANCE_EVENT, advance)
  }, [storageKey])

  const focusedTask = focus && visible.find((task) => task.id === focus.task)
  const focusedStep = focus ? ONBOARDING_UI[focus.step] : undefined
  const candidate = useMemo(
    () =>
      focusedTask && focusedStep?.task === focusedTask.id && focusedStep.page === page ? { task: focusedTask, ui: focusedStep } : undefined,
    [focusedStep, focusedTask, page],
  )

  const showStep = useCallback(
    async (next: OnboardingFocus) => {
      setFocus(next)
      sessionStorage.setItem(storageKey, JSON.stringify(next))
      await navigate({ href: ONBOARDING_UI[next.step].href })
    },
    [navigate, storageKey],
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
      placement: compactGuide ? 'bottom' : active.ui.placement,
      data: {
        task: active.task,
        dismiss: () => {
          posthog.capture('onboarding_task_paused', { task: active.task.id, step: focus?.step })
          setFocus(undefined)
          sessionStorage.removeItem(storageKey)
        },
        advance: active.ui.next
          ? {
              label: active.ui.nextLabel ?? 'Continue',
              run: () => void showStep({ task: active.task.id, step: active.ui.next! }),
            }
          : undefined,
        finish: active.ui.final
          ? () => {
              posthog.capture('onboarding_task_completed', { task: active.task.id })
              signalOnboardingProgress(active.task.id)
            }
          : undefined,
      } satisfies GuideStepData,
    }
  }, [active, compactGuide, focus?.step, posthog, showStep, storageKey, target])

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
      if (current && !next) sessionStorage.removeItem(storageKey)
      return next
    })
    updateProgress(operation)
  }

  const launch = async (task: OnboardingTask) => {
    if (!data?.welcomed) updateProgress({ operation: 'welcome' })
    setOpen(false)
    const next = { task: task.id, step: FIRST_ONBOARDING_STEP[task.id] }
    posthog.capture('onboarding_task_started', { task: task.id })
    await showStep(next)
  }

  if (!data) return null

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
  visible: OnboardingTask[]
  open: boolean
  busy: boolean
  onClose: () => void
  onLaunch: (task: OnboardingTask) => void
  onUpdate: (operation: OnboardingProgressOperation) => void
}) {
  if (!open) return null
  const resolved = new Set([...data.completedTasks, ...data.skippedTasks])
  const complete = resolved.size === onboardingTasks.length
  return (
    <aside
      aria-labelledby="onboarding-guide-title"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-50 flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden border border-edge bg-panel text-sm text-bone shadow-xl min-[860px]:bottom-4 min-[860px]:left-auto min-[860px]:max-h-[calc(100dvh-2rem)] min-[860px]:w-[32rem]"
    >
      <div className="relative border-b border-edge bg-sunken p-4 pr-12">
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-info">Getting started</p>
          <h2 id="onboarding-guide-title" className="text-xl text-bone">
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
    </aside>
  )
}

function GuideTooltip({ closeProps, step, tooltipProps }: TooltipRenderProps) {
  const { advance, dismiss, finish } = step.data as GuideStepData
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
      {advance ? (
        <Button
          {...closeProps}
          type="button"
          size="sm"
          className="pointer-events-auto mt-3 w-full"
          aria-label={advance.label}
          title={undefined}
          onClick={(event) => {
            closeProps.onClick(event)
            advance.run()
          }}
        >
          {advance.label} <ChevronRight />
        </Button>
      ) : finish ? (
        <Button
          {...closeProps}
          type="button"
          size="sm"
          className="pointer-events-auto mt-3 w-full"
          aria-label="Finish tour"
          title={undefined}
          onClick={(event) => {
            closeProps.onClick(event)
            finish()
          }}
        >
          <Check /> Finish tour
        </Button>
      ) : null}
    </section>
  )
}
