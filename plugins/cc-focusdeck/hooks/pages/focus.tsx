// Focus mode: a progress band above the prompt and the tool rows hidden
// from the transcript while it is on. The steps come from the band's own
// focus_progress tool (Claude posts its plan, then the number of each step
// it starts), and from the todo list, the task tools and an approved plan
// where the session has them; every tool call joins a feed of Claude's own
// one-line descriptions, and a row of it opens on what the call ran and
// printed. Costs, while on: the tool in the tool list, one line beside each
// prompt typed, and the tool's calls; off, nothing.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PromptSubmitInput, RenderChildren, RenderInput, Timer } from 'claude-code'

import type { FocusAction, FocusColors, FocusStep, FocusTask, FocusTheme, Panel, StepSource, TurnStop } from '../../types'
import { glyph, iconSetNow } from '../icons'
import {
  actionOf,
  bandColors,
  barRuns,
  callsText,
  canPost,
  clockText,
  detailOf,
  endsOnLastStep,
  feedInView,
  FEED_DETAIL_LINES,
  FOCUS_MARKER,
  FOCUS_THEMES,
  FOCUS_TOOL_DESCRIPTION,
  FOCUS_TOOL_NAME,
  FOCUS_TOOL_SCHEMA,
  isApprovedPlan,
  isWaiting,
  outputOf,
  parsePlanSteps,
  progressOf,
  progressPost,
  progressReply,
  RAINBOW,
  stampSteps,
  stepCaption,
  stepColor,
  stepsAfterPost,
  stepsFromTodos,
  stepsInView,
  stepTime,
  stepTint,
  stopLabel,
  taskElapsed,
  toStatus,
  withCall,
  withCallDone,
} from '../lib/focus'
import { rainbow, type Frame } from '../ui/frame'

const focusOn = atom({ plugin: 'cc-focusdeck', key: 'focusOn' } as const, false)
const theme = atom({ plugin: 'cc-focusdeck', key: 'focusTheme' } as const, 'blue')
const customColors = atom({ plugin: 'cc-focusdeck', key: 'focusCustom' } as const, { bar: '#60a5fa', text: '#e2e8f0', border: '#3b82f6' } satisfies FocusColors)
const collapsed = atom({ plugin: 'cc-focusdeck', key: 'focusCollapsed' } as const, false)
const task = atom({ plugin: 'cc-focusdeck', key: 'task' } as const, null)
const feed = atom({ plugin: 'cc-focusdeck', key: 'feed' } as const, [])
// The feed row opened on its detail, by the call's id.
const feedOpen = atom({ plugin: 'cc-focusdeck', key: 'feedOpen' } as const, null)
const now = atom({ plugin: 'cc-focusdeck', key: 'now' } as const, 0)

const HEX_COLOR = /^#[0-9a-f]{6}$/i
// How long "Done" stays on the band before it clears.
const DONE_LINGER_MS = 8000
// Rows the band gives its steps, and its feed of calls: alone, or under the running step.
const STEP_ROWS = 6
const FEED_ROWS = 4
const FEED_ROWS_UNDER_STEP = 2
// Columns the band leaves free at the right of the body.
const BAND_SLACK = 1

// Settings ---------------------------------------------------------------------

async function switchFocus($: EngineInterface, on: boolean) {
  await update($, focusOn, () => on)
  await $.store.set('focusOn', on)
  if (!on) await update($, task, () => null)
  // focus_progress sits in the tool list only while on.
  $.ui.invalidate('tool.describe')
}

async function pickTheme($: EngineInterface, next: FocusTheme) {
  await update($, theme, () => next)
  await $.store.set('focusTheme', next)
}

async function pickCustomColor($: EngineInterface, part: keyof FocusColors, raw: string) {
  const value = raw.trim()
  if (!HEX_COLOR.test(value)) {
    $.ui.toast(`${raw} is not a hex color like #3b82f6`)
    return
  }
  const colors = await update($, customColors, c => ({ ...c, [part]: value }))
  await $.store.set('focusCustom', colors)
}

export async function loadFocus($: EngineInterface) {
  const on = await $.store.get('focusOn')
  if (typeof on === 'boolean') await update($, focusOn, () => on)
  const kept = await $.store.get('focusTheme')
  if ((FOCUS_THEMES as readonly unknown[]).includes(kept)) await update($, theme, () => kept as FocusTheme)
  const colors = await $.store.get('focusCustom')
  if (colors !== undefined) await update($, customColors, () => colors as FocusColors)
}

// The clock -------------------------------------------------------------------

// One pulse per module load, moving `now` once a second while a task runs.
let pulse: Timer | undefined

function stopClock() {
  pulse?.cancel()
  pulse = undefined
}

function runClock($: EngineInterface) {
  stopClock()
  const tick = () => void $.clock.now().then(at => update($, now, () => at))
  pulse = $.clock.every(1000, tick)
}

// A /clear ends the session: its clock stops with it. The task and the feed
// are session values and start over on their own.
export function focusSessionEnd() {
  stopClock()
}

// The task ---------------------------------------------------------------------

// The first line of the last prompt typed: the band's title.
let promptTitle = ''

// The feed starts over with each prompt: the calls of the turn before stay
// on the band, open to inspection, until then.
async function clearFeed($: EngineInterface) {
  await update($, feed, () => [])
  await update($, feedOpen, () => null)
}

async function openTask($: EngineInterface, title: string) {
  const at = await $.clock.now()
  const opened: FocusTask = { title: title || 'Working', startedAt: at, doneAt: null, steps: [], waitingAt: null, pausedMs: 0 }
  await update($, task, () => opened)
  await clearFeed($)
  await update($, now, () => at)
  runClock($)
}

// A waiting task goes on; the time it waited leaves the clock.
async function continueTask($: EngineInterface) {
  const at = await $.clock.now()
  await update($, task, t => (t === null || !isWaiting(t) ? t : { ...t, waitingAt: null, stoppedBy: null, pausedMs: (t.pausedMs ?? 0) + (at - t.waitingAt!) }))
  await clearFeed($)
  await update($, now, () => at)
  runClock($)
}

// New steps land on the task under way; after a finished one, or none, on a new task.
async function landingTask($: EngineInterface) {
  const current = await read($, task)
  if (current === null || current.doneAt !== null) await openTask($, promptTitle)
  else if (isWaiting(current)) await continueTask($)
}

// The steps replaced, their clocks stamped against the ones before, the
// title when given, the source noted. A source that may not post (the band's
// own tool owns the task) leaves it as it is.
async function replaceSteps($: EngineInterface, source: StepSource, make: (prev: FocusStep[]) => FocusStep[], title?: string) {
  const at = await $.clock.now()
  await update($, task, t =>
    t === null || !canPost(source, t.source) ? t : { ...t, ...(title === undefined ? {} : { title }), source, steps: stampSteps(t.steps, make(t.steps), at, t.startedAt) },
  )
}

// Whether a source may post to the task under way; a finished one gives
// way to a new task.
async function mayPost($: EngineInterface, source: StepSource): Promise<boolean> {
  const t = await read($, task)
  return t === null || t.doneAt !== null || canPost(source, t.source)
}

// Each prompt typed continues the waiting task or opens a new one, and
// carries the one line that points Claude at focus_progress. From the
// prompt.submit hook in register.tsx.
export async function focusPromptSubmit($: EngineInterface, e: PromptSubmitInput): Promise<PromptSubmitInput> {
  const typed = e.text.trim()
  if (e.origin.kind !== 'composer' || typed === '' || typed.startsWith('/')) return e
  promptTitle = (typed.split('\n')[0] ?? '').slice(0, 200)
  if (!(await read($, focusOn))) return e
  const underway = await read($, task)
  if (underway !== null && underway.doneAt === null && isWaiting(underway)) await continueTask($)
  else await openTask($, promptTitle)
  return { ...e, context: [...(e.context ?? []), FOCUS_MARKER] }
}

// The turn's end: waiting when steps are still pending (the clock pauses),
// done when every step is or there were none. A turn that answered while
// focus_progress had its last step running finishes that step: the tool
// needs no call of its own to say done. A turn that ended without an answer
// (interrupted, refused, an error) says so, unless every step of its list
// was done: an empty list is no proof of success. With calls on the feed
// the band stays, open to inspection, until the next prompt; with none,
// Done stays a moment and clears. From the turn.complete hook.
export async function focusTurnComplete($: EngineInterface, reason: TurnStop | 'answer' = 'answer') {
  stopClock()
  const before = await read($, task)
  if (before === null || before.doneAt !== null || isWaiting(before)) return
  const at = await $.clock.now()
  const stop = reason === 'answer' ? null : reason
  if (stop === null && endsOnLastStep(before)) await replaceSteps($, 'progress', steps => steps.map(s => ({ ...s, status: 'completed' })))
  const underway = (await read($, task)) ?? before
  await update($, now, () => at)
  if (underway.steps.some(s => s.status !== 'completed')) {
    await update($, task, t => (t === null ? t : { ...t, waitingAt: at, stoppedBy: stop }))
    return
  }
  await update($, task, t => (t === null ? t : { ...t, doneAt: at, stoppedBy: t.steps.length === 0 ? stop : null }))
  if ((await read($, feed)).length > 0) return
  $.clock.after(DONE_LINGER_MS, () => {
    void update($, task, t => (t !== null && t.doneAt === at ? null : t))
  })
}

// Claude's own progress tool, registered at the session's start. Where it
// waits (the tool list, or behind ToolSearch) is the tool.describe hook's.
export async function registerFocusTool($: EngineInterface) {
  try {
    await $.tool.register({ name: FOCUS_TOOL_NAME, description: FOCUS_TOOL_DESCRIPTION, inputSchema: FOCUS_TOOL_SCHEMA })
  } catch (error) {
    try {
      $.ui.toast(`cc-focusdeck: the focus_progress tool could not be registered, so the Focus band shows no steps of its own: ${error instanceof Error ? error.message : String(error)}`)
    } catch {}
  }
}

// Drawing ----------------------------------------------------------------------

type Look = { colors: FocusColors; theme: FocusTheme; isLight: boolean }

async function lookNow($: EngineInterface): Promise<Look> {
  const current = await read($, theme)
  return { colors: bandColors(current, await read($, customColors)), theme: current, isLight: current === 'light' }
}

// The band above the prompt: null when Focus is off or nothing is running.
async function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>) {
  const t = await read($, task)
  if (t === null || !(await read($, focusOn))) return null
  const { Box, Text, Button } = $.ui.resolve(e)
  const look = await lookNow($)
  const { colors } = look
  const isFolded = await read($, collapsed)
  const clock = await read($, now)
  // The band stops one column short of the body: a glyph the terminal draws
  // a cell wider than Claude Code measures then still fits its line, where a
  // full-width line would wrap and leave the rows below drawn a line off.
  const columns = Math.max((e.props.bodyColumns ?? 80) - BAND_SLACK, 30)
  const frameProps = { borderStyle: 'round', borderColor: colors.border, paddingX: 1, width: columns } as const
  const titleText = (text: string) => (
    <Text color={colors.text} bold wrap="truncate">
      {text}
    </Text>
  )
  const paused = isWaiting(t)
  const percent = progressOf(t)
  // The title is the prompt: a star while the task runs, the done mark once
  // it is over, the cross when its last turn stopped without an answer. The
  // steps and the calls take one mark each: the brain until they are done,
  // the done mark then, the cross for a call that failed. The brain emoji
  // takes two cells and the marks one, so those are padded to keep the rows
  // lined up; Nerd glyphs are one cell each.
  const brain = await glyph($, 'brain')
  const doneMark = await glyph($, 'done')
  const failedMark = await glyph($, 'failed')
  const mark = t.doneAt === null ? '✶' : t.stoppedBy ? failedMark : doneMark
  const pad = (await iconSetNow($)) === 'unicode' ? ' ' : ''
  const rowMark = (done: boolean) => (done ? `${doneMark}${pad}` : brain)
  const callMark = (call: FocusAction) => (call.doneAt == null ? brain : call.failed ? `${failedMark}${pad}` : `${doneMark}${pad}`)
  const pauseWord = t.stoppedBy ? stopLabel(t.stoppedBy) : 'Paused'

  // The bar takes the room the title, the caption and the percent leave.
  const titleCells = isFolded ? Math.min(30, t.title.length + 2) : 0
  const barWidth = Math.max(8, columns - 26 - titleCells)
  const { filled, runs } = barRuns(look.theme, colors.bar, barWidth, percent)
  const bar = (
    <Box>
      {runs.map(run => (
        <Text color={run.color}>{'█'.repeat(run.cells)}</Text>
      ))}
      <Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
    </Box>
  )
  const percentText = (
    <Text color={colors.text} bold>
      {`${percent}%`.padStart(4)}
    </Text>
  )
  const foldButton = <Button key="focus-collapse" plain dimColor label={isFolded ? '[+]' : '[–]'} onPress={() => update($, collapsed, v => !v)} />

  if (isFolded)
    return (
      <Box {...frameProps} gap={1}>
        <Box width={titleCells}>{titleText(`${mark} ${t.title}`)}</Box>
        {t.steps.length > 0 ? bar : <Text dimColor>{`${stepCaption(t)}${callsText(t) === '' ? '' : ` · ${callsText(t)}`}`}</Text>}
        {t.steps.length > 0 && percentText}
        {foldButton}
      </Box>
    )

  // The feed: the last calls, each as Claude described it, the ones done
  // dimmed and the one under way in the band's color with its clock. Under
  // the running step, after the steps while none runs, or in their place
  // without a list; it stays after the turn, until the next prompt. A row is
  // a button: pressed, it opens on what its call ran and printed (the
  // command or the path, then the first lines out), and closes again.
  const calls = await read($, feed)
  const opened = await read($, feedOpen)
  const detailRows = (call: FocusAction, indent: number): RenderChildren => {
    const ran = (call.detail ?? '').split('\n').filter(l => l !== '')
    const out = (call.output ?? []).slice(0, FEED_DETAIL_LINES)
    const left = (call.output?.length ?? 0) - out.length + (call.moreLines ?? 0)
    const quiet = call.doneAt != null && out.length === 0
    return (
      <Box key={`feed-detail-${call.id}`} flexDirection="column" paddingLeft={indent + 2}>
        {ran.map((line, i) => (
          <Text key={`feed-ran-${call.id}-${i}`} color={colors.text} wrap="truncate">
            {`${i === 0 && call.tool === 'Bash' ? '$ ' : '  '}${line}`}
          </Text>
        ))}
        {out.map((line, i) => (
          <Text key={`feed-out-${call.id}-${i}`} dimColor wrap="truncate">
            {line === '' ? ' ' : line}
          </Text>
        ))}
        {call.doneAt == null && <Text dimColor>running…</Text>}
        {quiet && <Text dimColor>(no output)</Text>}
        {left > 0 && <Text dimColor>{`… ${left} more line${left === 1 ? '' : 's'} · ctrl+o shows the whole call`}</Text>}
      </Box>
    )
  }
  const feedRows = (indent: number, rows: number): RenderChildren[] =>
    feedInView(calls, rows).flatMap(call => {
      const running = call.doneAt == null
      const row = (
        <Box key={`feed-row-${call.id}`} paddingLeft={indent} gap={1} justifyContent="space-between">
          <Button key={`feed-${call.id}`} plain label={`${call.tool} ${call.target}`.trim()} onPress={() => update($, feedOpen, id => (id === call.id ? null : call.id))}>
            <Text wrap="truncate" dimColor={!running} color={running ? colors.text : undefined}>
              {`${callMark(call)} `}
              <Text bold={running}>{call.tool}</Text>
              {call.target === '' ? '' : `  ${call.target}`}
            </Text>
          </Button>
          {running && <Text dimColor>{clockText(clock - call.startedAt)}</Text>}
        </Box>
      )
      return opened === call.id ? [row, detailRows(call, indent)] : [row]
    })
  const callCount = callsText(t)
  const shown = stepsInView(t, STEP_ROWS)
  const runningRow = shown.findIndex(step => step.status === 'in_progress')
  const finished = t.steps.filter(s => s.status === 'completed').length

  // One row a step: its mark and number in the gutter, then a strip tinted
  // by state with the dot, the title, Working on the running one (Paused
  // while the turn is over, or how it stopped) and the step's clock.
  const stepRow = (step: FocusStep, i: number) => {
    const running = step.status === 'in_progress'
    const number = String(t.steps.indexOf(step) + 1).padStart(2)
    const time = stepTime(step, clock)
    return (
      <Box key={`step-${step.id}`} flexDirection="column">
        <Box gap={1}>
          <Text dimColor>{`${rowMark(step.status === 'completed')} ${number}`}</Text>
          <Box flexGrow={1} backgroundColor={stepTint(step.status, colors.bar, look.isLight)} paddingX={1} justifyContent="space-between" gap={1}>
            <Text wrap="truncate">
              <Text color={stepColor(step.status, colors.bar)}>{'● '}</Text>
              <Text color={running ? colors.text : undefined} bold={running} dimColor={step.status === 'pending'}>
                {step.text}
              </Text>
            </Text>
            <Box gap={2} flexShrink={0}>
              {running && <Text color={colors.text}>{paused ? pauseWord : 'Working'}</Text>}
              {time !== '' && <Text dimColor>{time}</Text>}
            </Box>
          </Box>
        </Box>
        {i === runningRow && feedRows(5, FEED_ROWS_UNDER_STEP)}
      </Box>
    )
  }

  return (
    <Box {...frameProps} flexDirection="column">
      <Box gap={1} justifyContent="space-between">
        {titleText(`${mark} ${t.title}`)}
        <Box flexShrink={0} gap={1}>
          <Text dimColor>{paused ? pauseWord.toLowerCase() : clockText(taskElapsed(t, clock))}</Text>
          {callCount !== '' && <Text dimColor>{`· ${callCount}`}</Text>}
          {foldButton}
        </Box>
      </Box>
      {t.steps.length > 0 ? (
        <Box gap={1}>
          <Text dimColor>{stepCaption(t).padEnd(14)}</Text>
          {bar}
          {percentText}
        </Box>
      ) : (
        // No list: the caption, then the feed in the steps' place, no bar to fill.
        <Text dimColor>{stepCaption(t)}</Text>
      )}
      {t.steps.length === 0 && feedRows(0, FEED_ROWS)}
      {shown.map(stepRow)}
      {t.steps.length > shown.length && <Text dimColor>{`${brain} +${t.steps.length - shown.length} more · ${finished} done`}</Text>}
      {t.steps.length > 0 && runningRow === -1 && feedRows(5, FEED_ROWS_UNDER_STEP)}
    </Box>
  )
}

// Focus on and off, on the Settings page, and the chip that opens the color
// page, framed and written in the band's color (rainbow: one color a letter).
export async function drawFocusSettings($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: (panel: Panel) => unknown): Promise<RenderChildren[]> {
  const { Text, Button } = $.ui.resolve(e)
  const { t, heading, chips, chip, framed } = ui
  const on = await read($, focusOn)
  const picked = await read($, theme)
  const { bar } = bandColors(picked, await read($, customColors))
  const label = t('focusBandRow')
  const painted = framed(
    'focus-band',
    true,
    <Button key="focus-band" plain label={label} onPress={() => go('focus-band')}>
      <Text color={bar}>{picked === 'rainbow' ? rainbow(label).map(({ ch, color }) => <Text color={color}>{ch}</Text>) : label}</Text>
    </Button>,
    bar,
  )
  return [
    heading(t('focusMode')),
    chips('focus-switch', [chip('focus-on', t('on'), on, () => switchFocus($, true)), chip('focus-off', t('off'), !on, () => switchFocus($, false)), painted]),
  ]
}

// The Focus color page, opened from Settings: the presets as rows of
// swatches, and three fields when the custom one is picked.
export async function drawFocusBandPage($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: (panel: Panel) => unknown): Promise<RenderChildren[]> {
  if (e.surface !== 'terminal' && e.surface !== 'desktop') return []
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const { t, heading, chips, chip, check, swatches } = ui
  const picked = await read($, theme)
  const custom = await read($, customColors)
  const rows: RenderChildren[] = [chips('focus-band-nav', [chip('focus-band-back', t('backSettings'), false, () => go('settings'))]), heading(t('bandColor'))]
  for (const option of FOCUS_THEMES) {
    const isOn = option === picked
    const sample = option === 'rainbow' ? RAINBOW.slice(0, 6) : Array<string>(6).fill(bandColors(option, custom).bar)
    rows.push(
      <Button key={`focus-theme-${option}`} plain label={option} onPress={() => pickTheme($, option)}>
        {swatches(sample)}
        <Text bold={isOn}>{option}</Text>
        {check(isOn)}
      </Button>,
    )
  }
  if (picked === 'custom') {
    const parts: (keyof FocusColors)[] = ['bar', 'text', 'border']
    const fields = parts.map(part => (
      <Input key={`focus-color-${part}`} label={`${part} ${t('colorSuffix')}`} value={custom[part]} placeholder="#3b82f6" submitLabel="set" onSubmit={value => pickCustomColor($, part, value)} />
    ))
    rows.push(
      <Box key="focus-custom" flexDirection="column">
        {fields}
      </Box>,
    )
  }
  return rows
}

// Hooks ------------------------------------------------------------------------

// Nothing drawn in a tool row's place while Focus is on.
const NOTHING = { display: 'none' } as const

export function registerFocus(on: On) {
  // The band, with what the mods after this one draw there kept under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const band = await drawBand($, e)
    if (band === null) return next(e)
    const theirs = (await next(e)) as RenderChildren
    if (theirs === null || theirs === undefined) return band
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {band}
        {theirs}
      </Box>
    )
  })
  // Tool rows draw nothing while Focus is on, except where they are worth
  // the room: the ctrl+o transcript (isExpanded) shows every call whole, and
  // a call that errored or was interrupted, or a group holding more than
  // plain calls, stays in the transcript. The run-in-background pill
  // (ToolProgress) is a control, never hidden.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) =>
    (await read($, focusOn)) && e.props.isExpanded !== true && !e.props.isErrored && !e.props.isInterrupted ? $.ui.resolve(e).Box(NOTHING) : next(e),
  )
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) =>
    (await read($, focusOn)) && e.props.isExpanded !== true && !e.props.isErrored ? $.ui.resolve(e).Box(NOTHING) : next(e),
  )
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) =>
    (await read($, focusOn)) && !e.props.isExpanded && e.props.isCallsOnly !== false ? $.ui.resolve(e).Box(NOTHING) : next(e),
  )

  // The band's own tool: the plan as short steps, then the number of each
  // step as it starts, done at the end. Only while Focus is on (a call found
  // through ToolSearch while off changes nothing) and from the main loop.
  // Once it posts, the task is its own: the other sources give way.
  // The literal, not FOCUS_TOOL, so `claude plugin validate` reads the matcher.
  on('tool.call', { tool: 'mcp__cc-focusdeck__focus_progress' }, async ($, e) => {
    if (!(await read($, focusOn))) return { result: 'Focus is off: the band is hidden, nothing updated.' }
    if (isAgentCall(e)) return { result: 'focus_progress is for the main conversation, not a subagent: nothing updated.' }
    const post = progressPost(e)
    if (post === null) return { result: 'Nothing to update: send steps (the plan), current (the step starting now) or done.' }
    const underway = await read($, task)
    const prev = underway !== null && underway.doneAt === null ? underway.steps : []
    const steps = stepsAfterPost(prev, post)
    if (steps === null) return { result: 'No plan on the band yet: send steps first, with current: 1.' }
    await landingTask($)
    await replaceSteps($, 'progress', () => steps, post.title ?? undefined)
    return { result: progressReply(steps) }
  }).catch(() => ({ result: 'Could not update the band: the focus_progress hook failed.' }))

  // focus_progress waits in the tool list while Focus is on and behind
  // ToolSearch while it is off; switchFocus asks again on a change.
  on('tool.describe', { tool: 'mcp__cc-focusdeck__focus_progress' }, async ($, e, next) => {
    const described = await next(e)
    return { ...described, description: FOCUS_TOOL_DESCRIPTION, isDeferred: !(await read($, focusOn)) }
  })

  // Claude's todo list, whole, each time it changes. A subagent's list
  // (e.agentId) is its own, not the band's.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    if (isAgentCall(e) || !(await mayPost($, 'todo'))) return next(e)
    const steps = stepsFromTodos(e.todos)
    if (steps.length > 0 && (await read($, focusOn))) await landingTask($)
    await replaceSteps($, 'todo', () => steps)
    return next(e)
  }).catch(($, e, next) => next(e))

  // A plan approved in plan mode, read as steps until focus_progress (or a
  // todo list) moves them.
  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    const ran = await next(e)
    const plan = isApprovedPlan(e as { agentId?: string }, ran as { deny?: unknown; isError?: unknown; result?: unknown })
    if (plan === null || !(await read($, focusOn)) || !(await mayPost($, 'plan'))) return ran
    const parsed = parsePlanSteps(plan)
    if (parsed.steps.length > 0) await landingTask($)
    if (parsed.steps.length > 0 || parsed.title !== null) await replaceSteps($, 'plan', prev => (parsed.steps.length > 0 ? parsed.steps : prev), parsed.title ?? undefined)
    return ran
  }).catch(($, e, next) => next(e))

  // Tasks: one step each, created pending, updated or removed by id.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    if (isAgentCall(e) || !(await mayPost($, 'tasks'))) return next(e)
    const ran = await next(e)
    const created = ran.result as { task?: { id?: string } } | undefined
    const id = created?.task?.id
    if (id === undefined) return ran
    if (await read($, focusOn)) await landingTask($)
    await replaceSteps($, 'tasks', prev => [...prev.filter(s => s.id !== id), { id, text: e.subject, status: 'pending' }])
    return ran
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    if (isAgentCall(e) || !(await mayPost($, 'tasks'))) return next(e)
    const ran = await next(e)
    const refused = ran.deny !== undefined || ran.isError === true
    if (refused) return ran
    await replaceSteps($, 'tasks', prev =>
      e.status === 'deleted'
        ? prev.filter(s => s.id !== e.taskId)
        : prev.map(s => (s.id === e.taskId ? { ...s, text: e.subject ?? s.text, status: e.status === undefined ? s.status : toStatus(e.status) } : s)),
    )
    return ran
  }).catch(($, e, next) => next(e))

  // Every tool call of the main loop joins the band's feed while it runs,
  // stays there once it returns, failed when it errored or was refused, with
  // what it ran and printed for its row to open on, and is counted on the
  // task. The plugin's own tools are the band's business, not the feed's.
  on('tool.call', async ($, e, next) => {
    if (isAgentCall(e) || e.tool.startsWith('mcp__cc-focusdeck__') || !(await read($, focusOn))) return next(e)
    const at = await $.clock.now()
    const input = e as unknown as Record<string, unknown>
    const call: FocusAction = { id: ++callSeq, ...actionOf(e.tool, input, at), detail: detailOf(e.tool, input) }
    await update($, feed, list => withCall(list, call))
    await update($, task, t => (t === null || t.doneAt !== null ? t : { ...t, calls: (t.calls ?? 0) + 1 }))
    let end: { failed: boolean; output?: ReturnType<typeof outputOf> } = { failed: true }
    try {
      const ran = await next(e)
      end =
        ran.deny !== undefined
          ? { failed: true, output: outputOf(ran.deny) }
          : ran.isError === true
            ? { failed: true, output: outputOf(ran.text ?? ran.result) }
            : { failed: false, output: outputOf(ran.result) }
      return ran
    } finally {
      const ended = await $.clock.now()
      await update($, feed, list => withCallDone(list, call.id, ended, end))
    }
  }).catch(($, e, next) => next(e))
}

// Numbers the calls of this process, so the feed tells parallel ones apart.
let callSeq = 0

// A subagent's call carries its agent's id; the main loop's carries none.
const isAgentCall = (e: unknown): boolean => (e as { agentId?: string }).agentId !== undefined

