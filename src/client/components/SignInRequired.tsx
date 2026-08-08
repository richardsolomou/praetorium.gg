import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'

/**
 * What a signed-out visitor is shown instead of the thing they asked for.
 *
 * `next` carries where they were going, so an invite link survives the detour:
 * signing in lands them back in the battle rather than on the front page.
 */
export function SignInRequired({ title, explanation, next }: { title: string; explanation: string; next?: string }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-3 text-sm text-dim">{explanation}</p>
      <Link to="/signin" search={{ next }} className={buttonVariants({ className: 'mt-8 h-11 w-full text-base' })}>
        Sign in
      </Link>
    </main>
  )
}
