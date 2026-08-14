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
      className={cn(
        // The track, the selected tab and the idle labels all sit on the navy
        // scale so the group belongs to the header it lives in.
        'h-10 w-full rounded-full bg-navy-900 p-1 [--muted-foreground:oklch(0.72_0.03_244)]',
        className,
      )}
    >
      {workspaceViews.map((view) => (
        <TabsTrigger
          key={view.value}
          value={view.value}
          className="rounded-full dark:data-active:border-transparent dark:data-active:bg-navy-800"
        >
          {view.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
