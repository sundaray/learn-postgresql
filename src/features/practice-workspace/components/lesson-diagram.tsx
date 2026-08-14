import type { ReactElement } from 'react'

import type { LessonDiagramId } from '@/features/lessons'

const labelFontSize = 13
/**
 * Rendered width of the longest label, "Planning and optimization", in Inter
 * Medium at labelFontSize. Measured with getComputedTextLength rather than
 * estimated. Re-measure if the labels or the font change.
 */
const longestLabelWidth = 161
/** Space between the label and the box edge. Boxes are sized from this. */
const labelPaddingX = 28

const boxWidth = longestLabelWidth + labelPaddingX * 2
const boxHeight = 44
const gapHeight = 30
/** One unit of margin each side so the 1px box stroke is not clipped. */
const diagramWidth = boxWidth + 2
const centerX = diagramWidth / 2
const arrowHeadWidth = 9
const arrowHeadHeight = 8
/** Clearance between a box edge and the arrow, so the arrow does not touch it. */
const arrowInset = 5

const executionStages = [
  'Parsing',
  'Rewriting',
  'Planning and optimization',
  'Execution',
]

const stageBoxes = executionStages.map((label, stageIndex) => ({
  label,
  y: 1 + stageIndex * (boxHeight + gapHeight),
}))

const diagramHeight =
  2 + executionStages.length * boxHeight + (executionStages.length - 1) * gapHeight

function SqlExecutionStagesDiagram() {
  return (
    <svg
      viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
      className="mx-auto w-full max-w-[240px]"
      role="img"
      aria-label="The four stages of SQL statement execution in PostgreSQL, in order: parsing, rewriting, planning and optimization, and execution."
    >
      {stageBoxes.map((stage, stageIndex) => {
        const boxBottom = stage.y + boxHeight
        const isLastStage = stageIndex === stageBoxes.length - 1
        const lineStart = boxBottom + arrowInset
        const lineEnd = boxBottom + gapHeight - arrowInset - arrowHeadHeight
        const arrowTip = lineEnd + arrowHeadHeight

        return (
          <g key={stage.label}>
            <rect
              x={(diagramWidth - boxWidth) / 2}
              y={stage.y}
              width={boxWidth}
              height={boxHeight}
              rx={8}
              className="fill-background stroke-navy-900/20"
              strokeWidth={1}
            />
            <text
              x={centerX}
              y={stage.y + boxHeight / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={labelFontSize}
              className="fill-navy-800 font-medium"
            >
              {stage.label}
            </text>

            {!isLastStage && (
              <>
                <line
                  x1={centerX}
                  y1={lineStart}
                  x2={centerX}
                  y2={lineEnd}
                  className="stroke-navy-800/50"
                  strokeWidth={1.5}
                />
                <path
                  d={`M ${centerX - arrowHeadWidth / 2} ${lineEnd} L ${centerX + arrowHeadWidth / 2} ${lineEnd} L ${centerX} ${arrowTip} Z`}
                  className="fill-navy-800/50"
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

const lessonDiagrams: Record<LessonDiagramId, () => ReactElement> = {
  'sql-execution-stages': SqlExecutionStagesDiagram,
}

type LessonDiagramProps = {
  diagramId: LessonDiagramId
}

export function LessonDiagram({ diagramId }: LessonDiagramProps) {
  const Diagram = lessonDiagrams[diagramId]

  return (
    <div className="rounded-lg bg-navy-900/7 px-4 py-6">
      <Diagram />
    </div>
  )
}
