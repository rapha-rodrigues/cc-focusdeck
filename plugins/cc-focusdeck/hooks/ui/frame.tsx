// What every page of the pane draws with: the open page and the language
// (atoms live here, read through accessors elsewhere), the pane's constants,
// the row under the prompt, and the chip, heading and swatch idiom built
// once per drawing from the surface's own elements.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { Lang, Panel } from '../../types'
import { RAINBOW } from '../lib/focus'
import type { Phrase } from '../lib/i18n'

const openPage = atom({ plugin: 'cc-focusdeck', key: 'menu' } as const, null)
const language = atom({ plugin: 'cc-focusdeck', key: 'lang' } as const, 'en')
// Whether this session's values were refilled from the store. A /clear
// resets every session value, this one too, so the next prompt restores
// whether or not a session.start event reached the plugin.
const refilled = atom({ plugin: 'cc-focusdeck', key: 'restored' } as const, false)

export function readMenu($: EngineInterface) {
  return read($, openPage)
}
export function setMenu($: EngineInterface, panel: Panel | null) {
  return update($, openPage, () => panel)
}
export function readRestored($: EngineInterface) {
  return read($, refilled)
}
export function markRestored($: EngineInterface) {
  return update($, refilled, () => true)
}
export function readLang($: EngineInterface) {
  return read($, language)
}

// The pane: a sidebar in the fullscreen layout, a block above the prompt otherwise.
export const PANE = 'cc-focusdeck'
export const PANE_SIZE = { rows: 26, columns: 56 }
// The pane's background until the terminal's own is known: the theme's
// own, as inverse text is drawn in the background's color (black or white in
// the built-in themes, the palette's background in one Themes wrote).
export const PANE_BACKGROUND = 'inverseText'
export const MENU_NAME = 'focusdeck'
// The tab strip's rows: the tabs and the rule under them.
export const TAB_STRIP_ROWS = 2

// A word in the rainbow, one color a letter.
export const rainbow = (text: string) => [...text].map((ch, i) => ({ ch, color: RAINBOW[i % RAINBOW.length]! }))

export type T = (key: Phrase, vars?: Record<string, string | number>) => string

export type Frame = {
  lng: Lang
  t: T
  columns: number
  rule: RenderChildren
  framed: (key: string, isOn: boolean, button: RenderChildren, frame?: string) => RenderChildren
  chip: (key: string, label: string, isOn: boolean, onPress: () => unknown, color?: string) => RenderChildren
  chips: (key: string, items: RenderChildren[]) => RenderChildren
  check: (isOn: boolean) => RenderChildren
  swatches: (colors: readonly string[]) => RenderChildren
  heading: (text: string, extra?: RenderChildren) => RenderChildren
}

// The engine's hint on one row (a second line holding only a separator
// drew as a stray dot).
const oneLineHint = (hint: string): string => {
  const lines = hint.split(/\r?\n/).map(l => l.trim())
  const spoken = lines.filter(l => /[\p{L}\p{N}]/u.test(l))
  return spoken.join(' · ')
}

// The row under the prompt as the engine and the other mods draw it, kept
// whole, with this plugin's one button at its right: Model, which opens the
// pane on the Model tab. The hint goes down on one row.
export async function drawPromptHint($: EngineInterface, e: RenderInput<'PromptHint'>, next: (e: RenderInput<'PromptHint'>) => Promise<unknown>, openModel: () => unknown) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const page = await read($, openPage)
  const theirs = (await next({ ...e, props: { ...e.props, hint: oneLineHint(e.props.hint) } })) as RenderChildren
  const open = page !== null
  return (
    <Box flexGrow={1} gap={2}>
      <Box flexGrow={1} flexShrink={1}>
        {theirs}
      </Box>
      <Button key="focusdeck-toggle" plain label="Model" onPress={openModel}>
        <Text bold={open} color={open ? 'claude' : undefined}>{`Model ${open ? '▼' : '▲'}`}</Text>
      </Button>
    </Box>
  )
}

// The drawing idiom, bound to one drawing's elements. A chip is a Button in
// a rounded frame (keyed `<key>-box`): the chosen one framed and written in
// the accent color, or in `frame`; the rest dim. Chips sit in a wrapping row.
export function frame($: EngineInterface, e: RenderInput<'Pane'>, lng: Lang, t: T, columns: number): Frame {
  const { Box, Text, Button } = $.ui.resolve(e)
  const width = Math.max(10, columns - 2)
  const rule = <Text dimColor>{'─'.repeat(width)}</Text>
  const framed: Frame['framed'] = (key, isOn, button, frameColor) => (
    <Box key={`${key}-box`} borderStyle="round" borderColor={isOn ? (frameColor ?? 'claude') : undefined} borderDimColor={!isOn} paddingX={1}>
      {button}
    </Box>
  )
  const chip: Frame['chip'] = (key, label, isOn, onPress, color) =>
    framed(
      key,
      isOn,
      <Button key={key} plain label={label} onPress={onPress}>
        <Text bold={isOn} color={isOn ? 'claude' : color}>
          {label}
        </Text>
      </Button>,
    )
  const chips: Frame['chips'] = (key, items) => (
    <Box key={key} flexWrap="wrap" columnGap={1}>
      {items}
    </Box>
  )
  const check: Frame['check'] = isOn => isOn && <Text color="claude">{' ✓'}</Text>
  const swatches: Frame['swatches'] = colors => (
    <Text>
      {colors.map(color => (
        <Text color={color}>{'■ '}</Text>
      ))}
    </Text>
  )
  const heading: Frame['heading'] = (text, extra) => (
    <Box key={`h-${text}`} marginTop={1} gap={1}>
      <Text dimColor>{text}</Text>
      {extra}
    </Box>
  )
  return { lng, t, columns, rule, framed, chip, chips, check, swatches, heading }
}
