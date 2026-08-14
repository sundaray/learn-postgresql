export const workspaceViews = [
  { value: 'lesson', label: 'Lesson' },
  { value: 'code', label: 'Code' },
  { value: 'output', label: 'Output' },
] as const

export type WorkspaceView = (typeof workspaceViews)[number]['value']

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  return workspaceViews.some((view) => view.value === value)
}

export type WorkspaceLayout = 'resizable' | 'tabbed'

export type DatabaseSchema = Record<string, string[]>

export type WorkspaceStatusTone = 'ready' | 'pending' | 'failed'

/** The one line that reports whether the workspace can run anything. */
export type WorkspaceStatus = {
  tone: WorkspaceStatusTone
  label: string
}

/**
 * A failure the learner cannot see in the output panel, with a way out. The
 * underlying PostgreSQL or worker error is deliberately absent: it names
 * internals the learner has no way to act on.
 */
export type WorkspaceFailure = {
  title: string
  actionLabel: string
  onAction: () => void
}
