// The hooks module: the pane and its tabs, the session's lifecycle, the
// prompt and turn hooks, and the tracking of the model, effort and mode. The
// pages draw themselves; this file routes to them.

import type { EngineInterface, On, Register, RenderChildren, RenderInput } from 'claude-code'

import type { Panel } from '../types'
import { loadIcons } from './icons'
import { phrase, type Phrase } from './lib/i18n'
import { drawCcslPage, focusCcsl, isCcslPanel, openEditor, scrollCcsl } from './pages/ccsl-editor'
import { drawFocusBandPage, focusPromptSubmit, focusSessionEnd, focusTurnComplete, loadFocus, registerFocus, registerFocusTool } from './pages/focus'
import { drawModeTab, loadModel, readEffort, trackEffort, trackModel } from './pages/model'
import { drawSettingsPage } from './pages/settings'
import { drawStatusLinePage, loadStatusLine } from './pages/statusline'
import { drawThemesTab, focusThemes, loadThemes, openThemes, readPaneBg, refreshPaneBg, scrollThemesBy, themesSessionEnd } from './pages/themes'
import { drawPromptHint, frame, markRestored, MENU_NAME, PANE, PANE_BACKGROUND, PANE_SIZE, readLang, readMenu, readRestored, setMenu } from './ui/frame'

// Pages ------------------------------------------------------------------------

type Tab = 'model' | 'settings'
const TABS: readonly { tab: Tab; label: Phrase }[] = [
  { tab: 'model', label: 'tabModel' },
  { tab: 'settings', label: 'tabSettings' },
]

// The tab a page lights: the sub-pages belong to Settings.
const tabOf = (panel: Panel): Tab => (panel === 'model' ? 'model' : 'settings')

// Pages whose own list scrolls inside a pane of fixed height.
const SCROLLING_PAGES: readonly Panel[] = ['themes', 'ccsl-editor', 'ccsl-add']

// Some pages do work when opened.
async function arriveAt($: EngineInterface, panel: Panel) {
  if (panel === 'themes') await openThemes($)
  if (panel === 'ccsl-editor') await openEditor($)
}

async function showPage($: EngineInterface, panel: Panel) {
  await setMenu($, panel)
  await arriveAt($, panel)
}

// The pane opened on a page, or closed.
async function toggleMenu($: EngineInterface, panel: Panel = 'model') {
  if ((await readMenu($)) !== null) {
    // The plugin's own close skips its own ui.close hook: the page resets here too.
    await $.ui.close({ id: PANE })
    await setMenu($, null)
    return
  }
  await showPage($, panel)
  await $.ui.open({ id: PANE, closeOnEscape: true, focus: true, title: MENU_NAME, ...PANE_SIZE })
}

// A shortcut button: opens the pane on its page, moves there, or closes it when already there.
async function jumpTo($: EngineInterface, panel: Panel) {
  const page = await readMenu($)
  if (page === null) await toggleMenu($, panel)
  else if (page !== panel) await showPage($, panel)
  else await toggleMenu($)
}

// The tab strip: the open tab in the accent color with a mark, the others
// dim, the close at the right; under them a rule, solid under the open tab.
function drawTabStrip($: EngineInterface, e: RenderInput<'Pane'>, open: Tab, t: (key: Phrase) => string, columns: number, close: () => unknown) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const labels = TABS.map(({ tab, label }) => ({ tab, text: tab === open ? `◆ ${t(label)}` : t(label) }))
  const width = Math.max(10, columns - 2)
  const underline = labels.map(({ tab, text }) => (tab === open ? '━'.repeat(text.length + 2) : '─'.repeat(text.length + 2))).join('─')
  return (
    <Box key="tabs" flexDirection="column">
      <Box gap={1}>
        {labels.map(({ tab, text }) => (
          <Button key={`tab-${tab}`} plain label={t(TABS.find(x => x.tab === tab)!.label)} autoFocus={tab === open ? true : undefined} onPress={() => showPage($, tab)}>
            {tab === open ? (
              <Text bold color="claude">{` ${text} `}</Text>
            ) : (
              <Text dimColor>{` ${text} `}</Text>
            )}
          </Button>
        ))}
        <Box flexGrow={1} />
        <Button key="focusdeck-close" plain dimColor label={t('close')} onPress={close} />
      </Box>
      <Text dimColor>
        {underline}
        {'─'.repeat(Math.max(0, width - underline.length))}
      </Text>
    </Box>
  )
}

// The pane: the tab strip, the page, the footer with the keys.
async function drawSidebar($: EngineInterface, e: RenderInput<'Pane'>, panel: Panel) {
  const drawable = e.surface === 'terminal' || e.surface === 'desktop'
  if (!drawable) return null
  const { Box, Text } = $.ui.resolve(e)
  const lng = await readLang($)
  const t = (key: Phrase, vars?: Record<string, string | number>) => phrase(lng, key, vars)
  const columns = e.props.bodyColumns ?? PANE_SIZE.columns
  const ui = frame($, e, lng, t, columns)
  const go = (to: Panel) => showPage($, to)

  let body: RenderChildren[]
  if (panel === 'model') body = await drawModeTab($, e, ui)
  else if (panel === 'settings') body = await drawSettingsPage($, e, ui, go)
  else if (panel === 'focus-band') body = await drawFocusBandPage($, e, ui, go)
  else if (panel === 'themes') body = await drawThemesTab($, e, ui, go)
  else if (panel === 'statusline') body = await drawStatusLinePage($, e, ui, go)
  else if (isCcslPanel(panel)) body = await drawCcslPage($, e, ui, go, panel)
  else body = []

  const scrolls = SCROLLING_PAGES.includes(panel)
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      backgroundColor={(await readPaneBg($)) ?? PANE_BACKGROUND}
      height={scrolls ? e.props.scroll.bodyRows : undefined}
      width={e.props.bodyColumns}
      minHeight={scrolls ? undefined : e.props.scroll.bodyRows}
    >
      {drawTabStrip($, e, tabOf(panel), t, columns, () => toggleMenu($))}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow={scrolls ? 'hidden' : undefined}>
        {body}
      </Box>
      <Box key="footer" flexDirection="column" marginTop={1} flexShrink={0}>
        {ui.rule}
        <Text dimColor>{t('keys')}</Text>
      </Box>
    </Box>
  )
}

// Lifecycle --------------------------------------------------------------------

// The kept settings into this session's values: at its start, and again
// after a /clear, which starts a session without a session.start.
async function restore($: EngineInterface) {
  await loadFocus($)
  await loadModel($)
  await loadThemes($)
  await loadStatusLine($)
  await loadIcons($)
  try {
    const id = await $.session.model()
    await trackModel($, id)
  } catch {}
  await refreshPaneBg($)
  await markRestored($)
}

const panelFor = (arg: string): Panel => {
  switch (arg) {
    case 'settings':
    case 'themes':
    case 'statusline':
      return arg
    case 'status':
      return 'statusline'
    case 'focus':
      return 'focus-band'
    case 'editor':
      return 'ccsl-editor'
    default:
      return 'model'
  }
}

function registerLifecycle(on: On) {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await restore($)
    await registerFocusTool($)
    await $.command.register({
      name: 'focusdeck',
      description: 'Open the focusdeck pane: model and effort, Focus, themes, status line',
      argumentHint: '[model|settings|themes|focus|statusline|editor|debug]',
      immediate: true,
    })
    return started
  })

  // A /clear ends the session and starts one with no session.start: the
  // pane, which outlives the session, is closed here, and the kept settings
  // come back at the first prompt (restore). Seen at session.end, which
  // reaches a user's mod on every account; the classic SessionStart event
  // does not on a Team or Enterprise login, where Claude Code's built-in
  // guard keeps the classic events from user mods.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await $.ui.close({ id: PANE }).catch(() => {})
      await setMenu($, null)
      focusSessionEnd()
    } else await themesSessionEnd($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'focusdeck' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'debug') {
      const settings = await $.config.list()
      const lines = settings.map(row => `${row.key} (${row.kind}) = ${JSON.stringify(row.value)}`)
      return { text: lines.join('\n') }
    }
    const panel = panelFor(arg)
    if ((await readMenu($)) === null) await toggleMenu($, panel)
    else await showPage($, panel)
    return { text: 'The pane is open.' }
  })
}

// The pane -------------------------------------------------------------------------

// The pane body's rows as last drawn, for the focus hook's measure of a list.
let bodyRowsSeen: number | undefined

function registerPane(on: On) {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    bodyRowsSeen = e.props.scroll.bodyRows
    const panel = await readMenu($)
    return (panel === null ? null : await drawSidebar($, e, panel)) ?? $.ui.resolve(e).Text({ children: '' })
  })

  // However the pane closes (esc, its close mark, the hint row's button), the page resets.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await setMenu($, null)
    return closed
  }).catch(($, e, next) => next(e))

  // Another pane drawn beside this one (cc-esol's, any mod's) closes this
  // one: the dock shows one pane, never the engine's row of tabs, and the
  // Model button brings it back.
  on('ui.open', async ($, e, next) => {
    const opened = await next(e)
    if (e.id !== PANE && 'value' in opened && opened.value.isPlaced && (await readMenu($)) !== null) {
      await $.ui.close({ id: PANE })
      await setMenu($, null)
    }
    return opened
  }).catch(($, e, next) => next(e))

  // The wheel moves a page's own list, never the pane, so the tabs stay put.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.by === 0) return next(e)
    const page = await readMenu($)
    if (page === 'themes') await scrollThemesBy($, e.by, e.bodyRows)
    else if (page !== null && isCcslPanel(page)) await scrollCcsl($, page, e.by, e.bodyRows)
    else return next(e)
    return {}
  }).catch(($, e, next) => next(e))

  // The focus ring reaching a row outside a list's window brings it into view.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    const page = await readMenu($)
    const rows = bodyRowsSeen ?? PANE_SIZE.rows
    if (page === 'themes') await focusThemes($, e.element, rows)
    else if (page !== null && isCcslPanel(page)) await focusCcsl($, page, e.element, rows)
    return moved
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => drawPromptHint($, e, next, () => jumpTo($, 'model')))
}

// Prompts, turns and tracking -----------------------------------------------------

function registerTurns(on: On) {
  // The prompt as submitted: Focus's task.
  on('prompt.submit', async ($, e, next) => {
    // After a /clear every session value is at its default: restore here
    // (a /clear starts a session without a session.start).
    if (!(await readRestored($))) await restore($)
    return next(await focusPromptSubmit($, e))
  }).catch(($, e, next) => next(e))

  // The main loop's end, and why it ended: a subagent's end (e.agentId) is
  // heard too and is not the turn's.
  on('turn.complete', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) {
      await focusTurnComplete($, (e as { reason?: 'answer' | 'aborted' | 'refusal' | 'error' }).reason ?? 'answer')
    }
    return next(e)
  })

  // The chosen effort rides on every request of the main loop; the model and
  // the level the engine would have used are noted for the Model page.
  on('turn.step', async function* ($, e, next) {
    const level = await readEffort($)
    const mainLoop = e.agentId === undefined
    if (mainLoop) {
      await trackEffort($, e.effort)
      await trackModel($, e.model)
    }
    return yield* next(level !== null && e.effort !== undefined ? { ...e, effort: level } : e)
  })
}

export const register: Register = on => {
  registerFocus(on)
  registerLifecycle(on)
  registerPane(on)
  registerTurns(on)
}
