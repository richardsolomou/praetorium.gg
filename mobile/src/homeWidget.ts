import { requireOptionalNativeModule } from 'expo'
import type { HomeWidget } from '../../src/contracts/homeWidget'
import { APP_URL } from './navigation'

const store = requireOptionalNativeModule<{ set(widget: string | null): void }>('PraetoriumHomeWidget')

/** Whether this build has a home screen widget to fill. */
export const homeWidgetAvailable = store !== null

/** Saves what the widget shows, with each line's page as a full address the widget can open; null empties it. */
export function saveHomeWidget(widget: HomeWidget | null) {
  store?.set(
    widget
      ? JSON.stringify({
          updatedAt: widget.updatedAt,
          items: widget.items.map(({ path, ...item }) => ({ ...item, url: new URL(path, APP_URL).href })),
        })
      : null,
  )
}
