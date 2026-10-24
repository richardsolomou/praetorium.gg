// The ES2023 array copies (toSorted, toReversed, toSpliced, with) are missing before Chrome 110,
// Safari 16 and Firefox 115, which the build target still supports. Import them before anything else.
import 'core-js/actual/array/to-reversed'
import 'core-js/actual/array/to-sorted'
import 'core-js/actual/array/to-spliced'
import 'core-js/actual/array/with'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { readAppSnapshot } from './client/offline/appStorage'

void readAppSnapshot()
  .catch(() => null)
  .then((snapshot) => {
    window.PraetoriumAppSnapshot = snapshot ?? undefined
    if (window.PraetoriumOffline) {
      void import('./client/offline/entry')
    } else {
      startTransition(() => {
        hydrateRoot(
          document,
          <StrictMode>
            <StartClient />
          </StrictMode>,
        )
      })
    }
  })
