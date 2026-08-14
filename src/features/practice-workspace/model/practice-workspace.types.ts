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

export type DatabasePreview = {
  engine: string
  name: string
  status: string
  schema: DatabaseSchema
}
