import { useSyncExternalStore } from 'react'

import type { WorkspaceLayout } from '../model/practice-workspace.types'

const compactWorkspaceQuery = '(max-width: 1023px)'

function subscribeToWorkspaceLayout(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(compactWorkspaceQuery)

  mediaQuery.addEventListener('change', onStoreChange)

  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getWorkspaceLayoutSnapshot() {
  return window.matchMedia(compactWorkspaceQuery).matches
}

function getServerWorkspaceLayoutSnapshot() {
  return false
}

export function useWorkspaceLayout(): WorkspaceLayout {
  const isCompact = useSyncExternalStore(
    subscribeToWorkspaceLayout,
    getWorkspaceLayoutSnapshot,
    getServerWorkspaceLayoutSnapshot,
  )

  return isCompact ? 'tabbed' : 'resizable'
}
