import type { SpacetimeOperator } from '../spacetimeOperator'
import { type RepositoryBase } from './area'

/** A player's onboarding, reminders, saved filters, defaults, push devices and calendar feed link. */
export function withPreferences<B extends RepositoryBase>(Base: B) {
  return class PreferenceRepository extends Base {
    onboardingProgress(userId: string) {
      return this.product.onboardingProgress(userId)
    }

    updateOnboardingProgress(...args: Parameters<SpacetimeOperator['updateOnboardingProgress']>) {
      return this.product.updateOnboardingProgress(...args)
    }

    abilityRemindersByUser(...args: Parameters<SpacetimeOperator['abilityRemindersByUser']>) {
      return this.product.abilityRemindersByUser(...args)
    }

    saveAbilityReminder(...args: Parameters<SpacetimeOperator['saveAbilityReminder']>) {
      return this.product.saveAbilityReminder(...args)
    }

    deleteAbilityReminder(...args: Parameters<SpacetimeOperator['deleteAbilityReminder']>) {
      return this.product.deleteAbilityReminder(...args)
    }

    pushEnabled(...args: Parameters<SpacetimeOperator['pushEnabled']>) {
      return this.product.pushEnabled(...args)
    }

    setPushEnabled(...args: Parameters<SpacetimeOperator['setPushEnabled']>) {
      return this.product.setPushEnabled(...args)
    }

    listFilterPreferences(...args: Parameters<SpacetimeOperator['listFilterPreferences']>) {
      return this.product.listFilterPreferences(...args)
    }

    setListFilterPreferences(...args: Parameters<SpacetimeOperator['setListFilterPreferences']>) {
      return this.product.setListFilterPreferences(...args)
    }

    playerDefaults(...args: Parameters<SpacetimeOperator['playerDefaults']>) {
      return this.product.playerDefaults(...args)
    }

    setPlayerDefaults(...args: Parameters<SpacetimeOperator['setPlayerDefaults']>) {
      return this.product.setPlayerDefaults(...args)
    }

    registerPushToken(...args: Parameters<SpacetimeOperator['registerPushToken']>) {
      return this.product.registerPushToken(...args)
    }

    unregisterPushToken(...args: Parameters<SpacetimeOperator['unregisterPushToken']>) {
      return this.product.unregisterPushToken(...args)
    }

    deletePushTokens(...args: Parameters<SpacetimeOperator['deletePushTokens']>) {
      return this.product.deletePushTokens(...args)
    }

    pushTargets(...args: Parameters<SpacetimeOperator['pushTargets']>) {
      return this.product.pushTargets(...args)
    }

    registerWebPushSubscription(...args: Parameters<SpacetimeOperator['registerWebPushSubscription']>) {
      return this.product.registerWebPushSubscription(...args)
    }

    unregisterWebPushSubscription(...args: Parameters<SpacetimeOperator['unregisterWebPushSubscription']>) {
      return this.product.unregisterWebPushSubscription(...args)
    }

    deleteWebPushSubscriptions(...args: Parameters<SpacetimeOperator['deleteWebPushSubscriptions']>) {
      return this.product.deleteWebPushSubscriptions(...args)
    }

    webPushTargets(...args: Parameters<SpacetimeOperator['webPushTargets']>) {
      return this.product.webPushTargets(...args)
    }

    storeNotices(...args: Parameters<SpacetimeOperator['storeNotices']>) {
      return this.product.storeNotices(...args)
    }

    noticesByUser(...args: Parameters<SpacetimeOperator['noticesByUser']>) {
      return this.product.noticesByUser(...args)
    }

    markNoticesRead(...args: Parameters<SpacetimeOperator['markNoticesRead']>) {
      return this.product.markNoticesRead(...args)
    }

    calendarFeedByUser(...args: Parameters<SpacetimeOperator['calendarFeedByUser']>) {
      return this.product.calendarFeedByUser(...args)
    }

    replaceCalendarFeed(...args: Parameters<SpacetimeOperator['replaceCalendarFeed']>) {
      return this.product.replaceCalendarFeed(...args)
    }

    removeCalendarFeed(...args: Parameters<SpacetimeOperator['removeCalendarFeed']>) {
      return this.product.removeCalendarFeed(...args)
    }

    calendarFeed(...args: Parameters<SpacetimeOperator['calendarFeed']>) {
      return this.product.calendarFeed(...args)
    }
  }
}
