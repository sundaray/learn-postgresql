import { useEffect, useEffectEvent, useRef } from 'react'
import { PostgreSQL, sql as sqlLanguage } from '@codemirror/lang-sql'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'

import type { DatabaseSchema } from '../model/practice-workspace.types'

const schemaCompartment = new Compartment()

const nightOwl = {
  foreground: '#d6deeb',
  background: '#011627',
  lineHighlight: '#28707d29',
  selection: '#1d3b53',
  lineNumber: '#4b6479',
  keyword: '#c792ea',
  string: '#ecc48d',
  number: '#f78c6c',
  constant: '#82aaff',
  comment: '#637777',
  operator: '#7fdbca',
  builtin: '#82aaff',
  specialVar: '#c5e478',
}

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: nightOwl.foreground,
      backgroundColor: 'transparent',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'inherit',
      fontSize: '0.875rem',
      lineHeight: '1.75rem',
    },
    '.cm-content': {
      padding: '1.25rem 0',
      caretColor: nightOwl.foreground,
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: nightOwl.lineNumber,
      borderRight: '1px solid var(--border)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '3rem',
      padding: '0 0.75rem 0 1rem',
    },
    '.cm-activeLine': {
      backgroundColor: `oklch(from ${nightOwl.background} calc(l * 1.4) c h)`,
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: nightOwl.foreground,
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: nightOwl.foreground },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: nightOwl.selection,
      },
    '.cm-tooltip': {
      backgroundColor: 'var(--popover)',
      color: 'var(--popover-foreground)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul > li': { padding: '0.25rem 0.5rem' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--accent)',
      color: 'var(--accent-foreground)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--card)',
      color: 'var(--foreground)',
      borderColor: 'var(--border)',
    },
  },
  { dark: true },
)

const sqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: nightOwl.keyword },
  { tag: tags.typeName, color: nightOwl.keyword },
  { tag: tags.string, color: nightOwl.string },
  { tag: tags.number, color: nightOwl.number },
  { tag: [tags.bool, tags.null], color: nightOwl.constant },
  { tag: tags.comment, color: nightOwl.comment, fontStyle: 'italic' },
  { tag: tags.operator, color: nightOwl.operator },
  { tag: tags.punctuation, color: nightOwl.foreground },
  { tag: tags.name, color: nightOwl.foreground },
  { tag: tags.standard(tags.name), color: nightOwl.builtin },
  { tag: tags.special(tags.name), color: nightOwl.specialVar },
  { tag: tags.special(tags.string), color: nightOwl.string },
])

function buildSqlExtension(schema: DatabaseSchema) {
  return sqlLanguage({
    dialect: PostgreSQL,
    schema,
    upperCaseKeywords: true,
  })
}

type SqlCodeEditorProps = {
  sql: string
  schema: DatabaseSchema
  onSqlChange: (nextSql: string) => void
}

export function SqlCodeEditor({
  onSqlChange,
  schema,
  sql,
}: SqlCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialStateRef = useRef({ sql, schema })

  const handleSqlChange = useEffectEvent((nextSql: string) => {
    onSqlChange(nextSql)
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialStateRef.current.sql,
        extensions: [
          basicSetup,
          schemaCompartment.of(
            buildSqlExtension(initialStateRef.current.schema),
          ),
          syntaxHighlighting(sqlHighlightStyle),
          editorTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              handleSqlChange(update.state.doc.toString())
            }
          }),
        ],
      }),
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    view.dispatch({
      effects: schemaCompartment.reconfigure(buildSqlExtension(schema)),
    })
  }, [schema])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }

    const currentSql = view.state.doc.toString()
    if (sql !== currentSql) {
      view.dispatch({
        changes: { from: 0, to: currentSql.length, insert: sql },
      })
    }
  }, [sql])

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-hidden font-mono"
      role="group"
      aria-label="SQL query editor"
    />
  )
}
