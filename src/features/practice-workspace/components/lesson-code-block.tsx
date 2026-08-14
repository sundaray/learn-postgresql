import { useEffect, useMemo, useRef, useState } from 'react'
import { File } from '@pierre/diffs/react'
import { CheckIcon, ClipboardIcon, Code2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const fileOptions = {
  theme: 'night-owl',
  disableFileHeader: true,
  overflow: 'scroll',
} as const

type LessonCodeBlockProps = {
  name: string
  contents: string
  /** Given for snippets a student can send straight to the SQL editor. */
  onLoadInEditor?: () => void
}

export function LessonCodeBlock({
  contents,
  name,
  onLoadInEditor,
}: LessonCodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const file = useMemo(() => ({ name, contents }), [name, contents])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  async function copyCode() {
    if (!navigator.clipboard) {
      return
    }

    try {
      await navigator.clipboard.writeText(contents)
    } catch {
      return
    }
    setCopied(true)

    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current)
    }

    resetTimerRef.current = setTimeout(() => {
      setCopied(false)
      resetTimerRef.current = null
    }, 2_000)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="mt-1 flex justify-end">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copied ? 'Code copied' : 'Copy code'}
                onClick={() => void copyCode()}
              />
            }
          >
            {copied ? (
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
            ) : (
              <ClipboardIcon data-icon="inline-start" aria-hidden="true" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy code</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="dark overflow-hidden rounded-lg border bg-background text-sm leading-normal">
        <File file={file} options={fileOptions} />
      </div>

      {onLoadInEditor && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 -ml-2.5 self-start text-muted-foreground"
          onClick={onLoadInEditor}
        >
          <Code2Icon data-icon="inline-start" />
          Load in editor
        </Button>
      )}
    </div>
  )
}
