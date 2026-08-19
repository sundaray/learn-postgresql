/**
 * PostgreSQL types whose values reach the browser as JavaScript dates. A date
 * carries no record of which type produced it, so the column's type decides how
 * to print it.
 */
const dateTypeId = 1082
const timestampTypeId = 1114

type DateParts = {
  year: number
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
  milliseconds: number
}

/**
 * `date` and `timestamptz` arrive as a point on the UTC timeline: the driver
 * reads `2022-12-11` and `2022-12-11 09:15:30+00` against UTC, so the UTC parts
 * hold what PostgreSQL stored.
 */
function readUtcParts(value: Date): DateParts {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hours: value.getUTCHours(),
    minutes: value.getUTCMinutes(),
    seconds: value.getUTCSeconds(),
    milliseconds: value.getUTCMilliseconds(),
  }
}

/**
 * `timestamp` has no offset to read, so the driver builds the date against the
 * browser's own zone. Its local parts are the wall clock PostgreSQL stored.
 */
function readLocalParts(value: Date): DateParts {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
    hours: value.getHours(),
    minutes: value.getMinutes(),
    seconds: value.getSeconds(),
    milliseconds: value.getMilliseconds(),
  }
}

function padNumber(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

function formatDate(parts: DateParts): string {
  return `${padNumber(parts.year, 4)}-${padNumber(parts.month, 2)}-${padNumber(parts.day, 2)}`
}

/** psql leaves the fractional part off when it is all zeros, so this does too. */
function formatTime(parts: DateParts): string {
  const clock = `${padNumber(parts.hours, 2)}:${padNumber(parts.minutes, 2)}:${padNumber(parts.seconds, 2)}`

  return parts.milliseconds === 0
    ? clock
    : `${clock}.${padNumber(parts.milliseconds, 3)}`
}

function formatTemporalValue(value: Date, dataTypeId: number): string {
  if (Number.isNaN(value.getTime())) {
    return 'NaN'
  }

  if (dataTypeId === dateTypeId) {
    return formatDate(readUtcParts(value))
  }

  if (dataTypeId === timestampTypeId) {
    const parts = readLocalParts(value)
    return `${formatDate(parts)} ${formatTime(parts)}`
  }

  // What is left is timestamptz, which the session reads and writes in UTC.
  const parts = readUtcParts(value)
  return `${formatDate(parts)} ${formatTime(parts)}+00`
}

/**
 * Renders one value the way psql prints it. `null` means the value was SQL
 * NULL, which the grid shows differently from the text `NULL`.
 */
export function formatCellValue(
  value: unknown,
  dataTypeId: number,
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (value instanceof Date) {
    return formatTemporalValue(value, dataTypeId)
  }

  // json and jsonb arrive parsed. Without this they would print as
  // `[object Object]`.
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}
