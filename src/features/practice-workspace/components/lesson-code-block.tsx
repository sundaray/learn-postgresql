import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { File } from '@pierre/diffs/react'
import { CheckIcon, ClipboardIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { LessonCodeBlockPreloads } from './lesson-code-files'
import { lessonCodeFileOptions } from './lesson-code-files'

const LessonCodeBlockPreloadContext =
  createContext<LessonCodeBlockPreloads>({})

export function LessonCodeBlockPreloadProvider({
  children,
  preloads,
}: {
  children: ReactNode
  preloads: LessonCodeBlockPreloads
}) {
  return (
    <LessonCodeBlockPreloadContext.Provider value={preloads}>
      {children}
    </LessonCodeBlockPreloadContext.Provider>
  )
}

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
  const preloads = useContext(LessonCodeBlockPreloadContext)
  const file = useMemo(() => ({ name, contents }), [name, contents])
  const prerenderedHTML = preloads[name]
  /** A one-line block is too short to pin the button to the top without it
      looking top-heavy, so it gets centred instead. */
  const isSingleLine = contents.trim().split('\n').length === 1

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
      <div className="dark relative overflow-hidden rounded-lg border bg-background text-sm leading-normal">
        <File
          file={file}
          options={lessonCodeFileOptions}
          {...(prerenderedHTML ? { prerenderedHTML } : {})}
        />

        <div
          className={
            isSingleLine
              ? 'absolute inset-y-0 right-2 flex items-center'
              : 'absolute top-2 right-2'
          }
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="bg-navy-800 text-white hover:bg-[color-mix(in_oklch,var(--color-navy-800),white_10%)] hover:text-white"
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
      </div>

      {onLoadInEditor && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={onLoadInEditor}
        >
          Load in editor
        </Button>
      )}
    </div>
  )
}
