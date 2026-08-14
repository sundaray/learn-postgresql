import { TablePropertiesIcon } from 'lucide-react'
import { useState } from 'react'
import type { CSSProperties } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import type { PracticeDatabase } from '../db/practice-database'
import { useDatabaseSchema } from '../db/use-database-schema'

type SchemaSheetProps = {
  bounds: CSSProperties
  className?: string
  database: PracticeDatabase | null
}

export function SchemaSheet({ bounds, className, database }: SchemaSheetProps) {
  // Re-reading on every open keeps the list in step with tables the learner
  // created or dropped since the sheet was last shown.
  const [openCount, setOpenCount] = useState(0)
  const tables = useDatabaseSchema(database, openCount)

  return (
    <Sheet
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setOpenCount((currentCount) => currentCount + 1)
        }
      }}
    >
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={className}
          />
        }
      >
        <TablePropertiesIcon data-icon="inline-start" />
        Schema
      </SheetTrigger>

      <SheetContent
        side="right"
        overlayStyle={bounds}
        style={{ ...bounds, height: 'auto' }}
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">Schema</SheetTitle>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {database
                ? 'This database has no tables yet.'
                : 'The database is still starting.'}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {tables.map((table) => (
                <section key={table.name} className="flex flex-col gap-2">
                  <h3 className="font-mono text-sm font-semibold">
                    {table.name}
                  </h3>
                  <ul className="flex flex-col rounded-lg border">
                    {table.columns.map((column) => (
                      <li
                        key={column.name}
                        className="flex items-baseline justify-between gap-4 border-b px-3 py-2 text-sm last:border-b-0"
                      >
                        <span className="min-w-0 truncate font-mono">
                          {column.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {column.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
