import type { TuiSceneProps } from '@deepseek-harness-tui/dsh-tui/scenes'
import { terminalTextWidth, textCursorSegments } from './scene-model.js'

interface SceneDomElement {
  parentNode?: SceneDomElement
  scrollTop?: number
  yogaNode?: {
    getComputedLeft(): number
    getComputedTop(): number
  }
}

export interface SceneSearchInputProps {
  React: TuiSceneProps['React']
  ui: TuiSceneProps['ui']
  query: string
  cursor: number | undefined
  maxWidth?: number
  compact?: boolean
  beginSearch(): void
}

// Font Awesome's search glyph is included by the Nerd Fonts commonly used by
// dsh-TUI terminals. It stays in one cell, unlike Emoji magnifying glasses,
// whose terminal-dependent width can shift every following pane border.
const SEARCH_PREFIX = '\uf002 '

function elementScreenPosition(node: SceneDomElement): { x: number; y: number } {
  let x = 0
  let y = 0
  let current: SceneDomElement | undefined = node
  while (current !== undefined) {
    x += current.yogaNode?.getComputedLeft() ?? 0
    y += current.yogaNode?.getComputedTop() ?? 0
    const parent: SceneDomElement | undefined = current.parentNode
    if (parent?.scrollTop !== undefined) y -= parent.scrollTop
    current = parent
  }
  return { x: Math.floor(x), y: Math.floor(y) }
}

/** Search field shared by the detail and navigation panes. */
export function SceneSearchInput({
  React,
  ui,
  query,
  cursor,
  maxWidth = 32,
  compact = false,
  beginSearch,
}: SceneSearchInputProps) {
  const { Box, Text } = ui
  const h = React.createElement
  const inputRef = React.useRef<SceneDomElement | null>(null)
  const segments = cursor === undefined ? undefined : textCursorSegments(query, cursor, maxWidth)
  const paddingLeft = compact ? 0 : 1

  React.useLayoutEffect(() => {
    if (cursor === undefined || process.stdout.isTTY !== true) return
    const element = inputRef.current
    if (element === null) return
    // The host schedules its terminal frame from resetAfterCommit. Queueing
    // here runs after that frame so IME preedit overlays the inverse caret.
    queueMicrotask(() => {
      if (inputRef.current !== element || process.stdout.destroyed) return
      const position = elementScreenPosition(element)
      const beforeWidth = terminalTextWidth(segments?.before ?? '')
      const targetRow = Math.max(1, position.y + 1)
      const caretX = position.x + paddingLeft + terminalTextWidth(SEARCH_PREFIX) + beforeWidth
      const targetColumn = Math.max(1, caretX + 1)
      try {
        process.stdout.write(`\u001b[${targetRow};${targetColumn}H`)
      } catch {
        // A closing output stream must not turn cursor parking into a Scene
        // failure.
      }
    })
  })

  return h(
    Box,
    {
      ref: (node: unknown) => { inputRef.current = node as SceneDomElement | null },
      flexDirection: 'row',
      width: compact ? undefined : '100%',
      height: compact ? 1 : 2,
      paddingLeft,
      borderStyle: compact ? undefined : 'single',
      borderTop: false,
      borderLeft: false,
      borderRight: false,
      borderColor: 'subtle',
      backgroundColor: 'toolCardBackgroundDim',
      onClick: beginSearch,
    },
    h(Text, { wrap: 'truncate-end' },
      SEARCH_PREFIX,
      cursor === undefined
        ? query
        : h(React.Fragment, null,
            segments?.before,
            h(Text, { inverse: true }, segments?.cursor),
            segments?.after,
          ),
    ),
  )
}
