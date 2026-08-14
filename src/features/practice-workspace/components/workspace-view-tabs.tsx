import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { workspaceViews } from '../model/practice-workspace.types'

type WorkspaceViewTabsProps = {
  className?: string
}

export function WorkspaceViewTabs({ className }: WorkspaceViewTabsProps) {
  return (
    <TabsList
      aria-label="Workspace views"
      className={cn('h-10 w-full rounded-full bg-muted/85 p-1', className)}
    >
      {workspaceViews.map((view) => (
        <TabsTrigger key={view.value} value={view.value} className="rounded-full">
          {view.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
