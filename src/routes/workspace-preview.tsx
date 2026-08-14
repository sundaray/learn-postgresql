import { createFileRoute } from '@tanstack/react-router'

import { PracticeWorkspace } from '@/features/practice-workspace'

export const Route = createFileRoute('/workspace-preview')({
  component: PracticeWorkspace,
})
