import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'

import { formatCellValue } from '../db/format-cell-value'
import type { ResultField } from '../db/run-query'

type ResultGridProps = {
  fields: readonly ResultField[]
  rows: readonly Record<string, unknown>[]
}

/** One 20px line of text, the py-2 padding around it, and the row's border. */
const rowHeight = 37

/** px-3 on both sides of a cell, plus the 1px border between columns. */
const cellChromeWidth = 25

const minColumnWidth = 72
const fallbackColumnWidth = 160

/**
 * Column widths come from a sample. A result can hold hundreds of thousands of
 * values, and measuring all of them costs more than the occasional value past
 * the sample that ends up clipped.
 */
const widthSampleSize = 400

/**
 * A column is as wide as its widest sampled value. There is no upper bound: a
 * value the reader cannot see in full is worse than a sideways scroll.
 */
function columnWidthFor(width: number): number {
  return Math.max(minColumnWidth, Math.ceil(width))
}

/**
 * Only the visible rows are mounted, so the browser can no longer size columns
 * from the whole result the way table layout does. Widths are measured up front
 * instead, otherwise every scroll would resize the columns under the reader.
 */
function measureColumnWidths(
  fields: readonly ResultField[],
  rows: readonly Record<string, unknown>[],
): number[] {
  const context =
    typeof document === 'undefined'
      ? null
      : document.createElement('canvas').getContext('2d')

  if (!context) {
    return fields.map(() => fallbackColumnWidth)
  }

  const fontFamily = getComputedStyle(document.body).fontFamily
  const headerFont = `600 14px ${fontFamily}`
  const cellFont = `400 14px ${fontFamily}`
  const sample = rows.slice(0, widthSampleSize)

  return fields.map((field) => {
    context.font = headerFont
    let widest = context.measureText(field.name).width

    context.font = cellFont
    for (const row of sample) {
      const text = formatCellValue(row[field.name], field.dataTypeId) ?? 'NULL'
      widest = Math.max(widest, context.measureText(text).width)
    }

    return columnWidthFor(widest + cellChromeWidth)
  })
}

/**
 * The result table for a SELECT. Rows are virtualized, so a query that matches
 * every row in a table still renders as fast as one that matches a single row.
 */
export function ResultGrid({ fields, rows }: ResultGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const columnWidths = useMemo(
    () => measureColumnWidths(fields, rows),
    [fields, rows],
  )

  const totalWidth = columnWidths.reduce((total, width) => total + width, 0)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })

  return (
    <ScrollArea
      orientation="both"
      className="h-full"
      viewportRef={scrollRef}
    >
      {/*
        Grid and flex replace table layout here. Native table layout sizes
        columns from the rows it can see, which is the wrong set once rows are
        virtualized, and it cannot place a row at an arbitrary offset.
      */}
      {/*
        The grid is as wide as its columns, or as wide as the panel when the
        columns leave room to spare. Without the second half the table stops
        short of the panel edge and the rows end in mid-air.
      */}
      <table
        className="grid w-full text-center text-sm"
        style={{ minWidth: totalWidth }}
        aria-rowcount={rows.length}
      >
        <thead className="sticky top-0 z-10 grid bg-background">
          <tr className="flex border-b">
            {fields.map((field, columnIndex) => (
              <th
                key={field.name}
                className="shrink-0 truncate border-r px-3 py-2 font-semibold last:grow last:border-r-0"
                style={{ width: columnWidths[columnIndex] }}
              >
                {field.name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody
          className="relative grid"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]

            return (
              <tr
                key={virtualRow.key}
                className="absolute flex w-full border-b"
                style={{
                  height: rowHeight,
                  transform: `translateY(${virtualRow.start}px)`,
                  minWidth: totalWidth,
                }}
              >
                {fields.map((field, columnIndex) => {
                  const text = formatCellValue(
                    row?.[field.name],
                    field.dataTypeId,
                  )

                  return (
                    <td
                      key={field.name}
                      // A clipped value stays readable on hover.
                      title={text ?? undefined}
                      className="shrink-0 truncate border-r px-3 py-2 text-muted-foreground last:grow last:border-r-0"
                      style={{ width: columnWidths[columnIndex] }}
                    >
                      {text ?? 'NULL'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </ScrollArea>
  )
}
