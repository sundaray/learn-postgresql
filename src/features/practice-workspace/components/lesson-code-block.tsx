import { useMemo } from 'react'
import { File } from '@pierre/diffs/react'

const fileOptions = {
  theme: 'night-owl',
  disableFileHeader: true,
  overflow: 'scroll',
} as const

type LessonCodeBlockProps = {
  name: string
  contents: string
}

export function LessonCodeBlock({ contents, name }: LessonCodeBlockProps) {
  const file = useMemo(() => ({ name, contents }), [name, contents])

  return <File file={file} options={fileOptions} />
}
