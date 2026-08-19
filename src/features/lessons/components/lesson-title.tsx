import { LessonRichText } from './lesson-rich-text'

/**
 * The SQL keywords lesson titles are written with. They are matched longest
 * first, so `EXPLAIN ANALYZE` is marked as one keyword rather than two.
 */
const sqlKeywords = [
  'ANALYZE',
  'CREATE INDEX',
  'DROP INDEX',
  'EXPLAIN ANALYZE',
  'EXPLAIN',
  'GROUP BY',
  'LIMIT',
  'OFFSET',
  'ORDER BY',
  'SELECT',
  'VACUUM',
  'WHERE',
]

/**
 * Matches a keyword and captures a plural `s` after it separately, so
 * "OFFSETs" is marked as the keyword followed by a plain letter.
 */
const sqlKeywordPattern = new RegExp(
  `\\b(${[...sqlKeywords]
    .sort((first, second) => second.length - first.length)
    .join('|')})(s?)(?![A-Za-z])`,
  'g',
)

function markSqlKeywords(title: string): string {
  return title.replace(sqlKeywordPattern, '`$1`$2')
}

type LessonTitleProps = {
  title: string
}

/**
 * A lesson title in a list, with its SQL keywords set in the same inline code
 * style lesson prose uses.
 */
export function LessonTitle({ title }: LessonTitleProps) {
  return <LessonRichText text={markSqlKeywords(title)} />
}
