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
import type { CodeBlockPreloads } from '@/components/code-block-options'
import { codeBlockFileOptions } from '@/components/code-block-options'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const CodeBlockPreloadContext = createContext<CodeBlockPreloads>({})

export function CodeBlockPreloadProvider({
  children,
  preloads,
}: {
  children: ReactNode
  preloads: CodeBlockPreloads
}) {
  return (
    <CodeBlockPreloadContext.Provider value={preloads}>
      {children}
    </CodeBlockPreloadContext.Provider>
  )
}

type CodeBlockProps = {
  name: string
  contents: string
  /** Rendered under the block, for controls only one caller needs. */
  action?: ReactNode
}

export function CodeBlock({ contents, name, action }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preloads = useContext(CodeBlockPreloadContext)
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
          options={codeBlockFileOptions}
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
                  className="bg-navy-800 text-white hover:bg-navy-800 hover:text-white dark:hover:bg-navy-800"
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

      {action}
    </div>
  )
}
