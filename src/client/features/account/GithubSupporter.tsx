import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { checkGithubSponsorship, unlinkOwnAccount } from '../../../server/functions'
import { authClient } from '../../authClient'
import { hasNativeAuthBridge } from '../../nativeAuth'
import { SPONSOR } from '../../projectLinks'
import { accountMethodsQuery, githubSponsorshipQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const SPONSORSHIP_TEXT = {
  public: 'Your profile shows the supporter badge. Thank you for helping keep Praetorium running.',
  private: 'Your sponsorship is private on GitHub, so your profile does not show a badge. Make it public on GitHub to show one.',
  none: 'This GitHub account is not sponsoring the project. Sponsors get a supporter badge on their profile and nothing else changes.',
}

/**
 * The supporter badge's one switch: a GitHub account linked only to prove a sponsorship.
 *
 * GitHub never signs anybody in, so it sits apart from the sign-in methods. The
 * native shell cannot open a GitHub authorization yet, so it points to the website,
 * where the link made once shows on every device.
 */
export function GithubSupporter() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery(githubSponsorshipQuery())
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: githubSponsorshipQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: accountMethodsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: ['user-profile'] }),
    ])
  }
  const check = useMutation({ mutationFn: () => checkGithubSponsorship(), onSuccess: refresh })
  const unlink = useMutation({ mutationFn: () => unlinkOwnAccount({ data: { provider: 'github' } }), onSuccess: refresh })
  if (!status?.available) return null
  const { linked } = status
  const error = check.error ?? unlink.error
  return (
    <section data-github-supporter className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <p className="rubric border-b border-edge pb-2">Supporter</p>
        <h2 className="mt-4 text-base">GitHub Sponsors</h2>
        <p className="mt-1 text-sm text-dim">
          {linked ? (
            SPONSORSHIP_TEXT[status.sponsorship ?? 'none']
          ) : (
            <>
              <a
                href={SPONSOR}
                className="text-info underline-offset-4 hover:text-parchment hover:underline"
                rel="noreferrer noopener"
                target="_blank"
              >
                Sponsors
              </a>{' '}
              who link the GitHub account they sponsor from get a supporter badge on their profile. GitHub is never used to sign in.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {linked ? (
          <>
            <Button type="button" variant="outline" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? 'Checking…' : 'Check again'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
              Unlink GitHub
            </Button>
          </>
        ) : hasNativeAuthBridge() ? (
          <p className="text-sm text-faint">Link GitHub from praetorium.gg in a browser.</p>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              posthog.capture('github_account_linking_started')
              void authClient.linkSocial({ provider: 'github', callbackURL: '/profile', errorCallbackURL: '/profile' })
            }}
          >
            Link GitHub
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : null}
    </section>
  )
}
