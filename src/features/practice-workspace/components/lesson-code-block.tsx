import { CodeBlock } from '@/components/code-block'
import { Button } from '@/components/ui/button'

type LessonCodeBlockProps = {
  name: string
  contents: string
  /** Given for snippets a student can send straight to the SQL editor. */
  onLoadInEditor?: () => void
}

/** The shared code block plus the lesson-only shortcut into the SQL editor. */
export function LessonCodeBlock({
  contents,
  name,
  onLoadInEditor,
}: LessonCodeBlockProps) {
  return (
    <CodeBlock
      name={name}
      contents={contents}
      action={
        onLoadInEditor ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground"
            onClick={onLoadInEditor}
          >
            Load in editor
          </Button>
        ) : undefined
      }
    />
  )
}
