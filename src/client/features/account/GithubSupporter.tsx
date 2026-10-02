import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { checkGithubSponsorship } from '../../../server/functions'
import { SPONSOR } from '../../projectLinks'
import { githubSponsorshipQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const SPONSORSHIP_TEXT = {
  public: 'Public sponsor. Your profile shows the Supporter badge.',
  private: 'Private sponsor. Make your sponsorship public on GitHub to show the badge.',
  none: 'No active sponsorship found. Sponsors get a Supporter badge on their profile.',
}

export function GithubSupporter() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery(githubSponsorshipQuery())
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: githubSponsorshipQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: ['user-profile'] }),
    ])
  }
  const check = useMutation({ mutationFn: () => checkGithubSponsorship(), onSuccess: refresh })
  if (!status?.available) return null
  const { linked } = status
  return (
    <div data-github-supporter className="space-y-2 border-l-2 border-info/40 py-1 pl-3">
      <div className="flex items-center gap-2">
        {linked ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-info pointer-coarse:size-11"
                  aria-label="Refresh sponsorship status"
                  disabled={check.isPending}
                  onClick={() => check.mutate()}
                />
              }
            >
              <RefreshCw className={check.isPending ? 'animate-spin' : ''} aria-hidden />
            </TooltipTrigger>
            <TooltipContent role="tooltip" side="top">
              Refresh GitHub sponsorship status
            </TooltipContent>
          </Tooltip>
        ) : null}
        <p className="min-w-0 text-xs text-dim">
          {linked ? (
            SPONSORSHIP_TEXT[status.sponsorship ?? 'none']
          ) : (
            <>
              Link GitHub to check your sponsorship.{' '}
              <a href={SPONSOR} className="text-info underline-offset-4 hover:underline" rel="noreferrer noopener" target="_blank">
                Sponsor Praetorium
              </a>
            </>
          )}
        </p>
      </div>
      {check.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(check.error)}
        </p>
      ) : null}
    </div>
  )
}
