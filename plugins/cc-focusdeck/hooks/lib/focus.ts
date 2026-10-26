// Focus mode's arithmetic and look: the band's colors, the progress numbers,
// the step clocks, the approved plan read as steps, the feed of calls with
// what each one ran and printed, and the band's own progress tool. Pure.

import type { FocusAction, FocusColors, FocusStep, FocusTask, FocusTheme, StepSource, StepStatus, TurnStop } from '../../types'
import { blend } from './colors'

// Eight colors, red to pink, for the rainbow band and the rainbow effort word.
export const RAINBOW = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#60a5fa', '#c084fc', '#f472b6']

export const FOCUS_THEMES: readonly FocusTheme[] = ['blue', 'dark', 'light', 'green', 'pink', 'rainbow', 'custom']

// The bar, the text and the border of each preset. `light` writes in the
// theme's own text color, so it reads on a dark terminal and on a light one.
const PRESET_COLORS: Readonly<Record<Exclude<FocusTheme, 'custom'>, FocusColors>> = {
  blue: { bar: '#60a5fa', text: '#dbeafe', border: '#3b82f6' },
  dark: { bar: '#d1d5db', text: '#e5e7eb', border: '#4b5563' },
  light: { bar: '#bfdbfe', text: 'text', border: '#d1d5db' },
  green: { bar: '#4ade80', text: '#dcfce7', border: '#16a34a' },
  pink: { bar: '#f472b6', text: '#fce7f3', border: '#db2777' },
  rainbow: { bar: '#f87171', text: '#fbcfe8', border: '#f472b6' },
}

export const bandColors = (theme: FocusTheme, custom: FocusColors): FocusColors => (theme === 'custom' ? custom : PRESET_COLORS[theme])

export const STEP_STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'completed']
export const toStatus = (value: unknown): StepStatus => ((STEP_STATUSES as readonly unknown[]).includes(value) ? (value as StepStatus) : 'pending')

// A span of milliseconds as `12s` or `3m 05s`-style `3m 5s`.
export const clockText = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds % 60}s`
}

const doneCount = (t: FocusTask) => t.steps.filter(s => s.status === 'completed').length

// `3 calls`, for the band's header; empty before the first call.
export const callsText = (t: FocusTask): string => {
  const n = t.calls ?? 0
  return n === 0 ? '' : `${n} call${n === 1 ? '' : 's'}`
}

// The band's own tool. Claude posts its plan as short steps, then only the
// number of the step it starts, in the same message as that step's first
// tool call: an update costs a few output tokens and no request of its own.
// The rules live in the description (in the tool list while Focus is on,
// behind ToolSearch while off); each prompt typed while on carries one line
// pointing at them. Beside the prompt, not in the system prompt: Claude
// Code's built-in guard keeps a user's plugin out of the system prompt on a
// Team or Enterprise login, and a line beside the prompt reaches the model
// everywhere. The todo tools, the task tools and an approved plan still
// feed the band where the session has them.
export const FOCUS_TOOL_NAME = 'focus_progress'
export const FOCUS_TOOL = 'mcp__cc-focusdeck__focus_progress'
export const MAX_STEPS = 20
export const MAX_STEP_TEXT = 80

export const FOCUS_TOOL_DESCRIPTION = [
  'Updates the Focus band, the progress band the user watches above the prompt while Focus is on: the user does not see your tool calls or their output then, only your text and this band.',
  'Use it for a task that will take more than two tool calls; a shorter one needs no plan.',
  'First call, before the task\'s first tool call (or right after a plan is approved): steps, your plan in order as short steps of a few words each, and current: 1.',
  'Then, as each step starts, send only current (its number, counting from 1) in the same message as that step\'s first tool call, never in a message of its own.',
  'The band finishes the task when your turn ends on its last step: send nothing to close it. Send done: true only when the work is done and the turn goes on with other tool calls.',
  'Send steps again only when the plan changes. Main conversation only, never from a subagent.',
].join(' ')

export const FOCUS_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Optional short name for the whole task.' },
    steps: { type: 'array', items: { type: 'string' }, description: 'The plan in order, one short step each: on the first call, and again only when the plan changes.' },
    current: { type: 'integer', minimum: 1, description: 'The step starting now, counting from 1; the ones before it are done.' },
    done: { type: 'boolean', description: 'True once every step is done.' },
  },
}

export const FOCUS_MARKER = `Focus band is on: for a task of more than two tool calls, keep it updated with ${FOCUS_TOOL} as its description says.`

// A focus_progress call's input, checked: the steps trimmed and bounded
// (a string each, or an object with a text, as some models send them).
// Null when it carries nothing to apply.
export type ProgressPost = { title: string | null; steps: string[] | null; current: number | null; done: boolean }

export const progressPost = (input: unknown): ProgressPost | null => {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const texts = Array.isArray(raw.steps)
    ? raw.steps.flatMap(s => {
        const text = typeof s === 'string' ? s : typeof s === 'object' && s !== null && typeof (s as { text?: unknown }).text === 'string' ? (s as { text: string }).text : ''
        return text.trim() === '' ? [] : [text.trim().slice(0, MAX_STEP_TEXT)]
      })
    : []
  const steps = texts.length > 0 ? texts.slice(0, MAX_STEPS) : null
  const current = typeof raw.current === 'number' && Number.isInteger(raw.current) && raw.current >= 1 ? raw.current : null
  const done = raw.done === true
  const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title.trim().slice(0, MAX_STEP_TEXT) : null
  return steps === null && current === null && !done ? null : { title, steps, current, done }
}

// Step ids by their text, so a revised plan keeps the clocks of the steps
// it keeps; a repeated text is numbered.
const progressIds = (texts: readonly string[]): string[] => {
  const seen = new Map<string, number>()
  return texts.map(text => {
    const n = (seen.get(text) ?? 0) + 1
    seen.set(text, n)
    return n === 1 ? `p:${text}` : `p:${text}#${n}`
  })
}

// The steps after a post: the plan it gives, or the one on the band; done up
// to the current step, that one running, the rest pending; every one done
// on done. A plan with no number keeps the states it had by text, and a
// fresh one starts at its first step. Null with no plan to apply it to.
export const stepsAfterPost = (prev: readonly FocusStep[], post: ProgressPost): FocusStep[] | null => {
  const texts = post.steps ?? (prev.length > 0 ? prev.map(s => s.text) : null)
  if (texts === null) return null
  const ids = progressIds(texts)
  const at = post.done ? texts.length : post.current === null ? null : Math.min(post.current, texts.length + 1) - 1
  if (at === null) {
    const kept = texts.map((text, i): FocusStep => ({ id: ids[i]!, text, status: prev.find(s => s.text === text)?.status ?? 'pending' }))
    const fresh = !kept.some(s => s.status !== 'pending')
    return fresh ? kept.map((s, i) => (i === 0 ? { ...s, status: 'in_progress' } : s)) : kept
  }
  return texts.map((text, i) => ({ id: ids[i]!, text, status: i < at ? 'completed' : i === at ? 'in_progress' : 'pending' }))
}

// What the tool answers: a few words, since the model reads them.
export const progressReply = (steps: readonly FocusStep[]): string => {
  const running = steps.findIndex(s => s.status === 'in_progress')
  return running >= 0 ? `Band: step ${running + 1} of ${steps.length}.` : `Band: ${doneSteps(steps)} of ${steps.length} steps done.`
}
const doneSteps = (steps: readonly FocusStep[]) => steps.filter(s => s.status === 'completed').length

// A focus_progress task whose last step is running and every other one
// done: what a turn that answers then has finished.
export const endsOnLastStep = (t: FocusTask): boolean =>
  t.source === 'progress' && t.steps.length > 0 && t.steps.at(-1)!.status === 'in_progress' && t.steps.slice(0, -1).every(s => s.status === 'completed')

// Which source may post the task's steps: the band's own tool owns a task
// once it posts, and the others give way to it; among the others the latest
// posts.
export const canPost = (incoming: StepSource, current: StepSource | undefined): boolean => incoming === 'progress' || current !== 'progress'

// The band's feed: the last calls of the main loop in the order they
// started, at most `cap` kept. A call under way stays whatever comes after
// it (calls run in parallel); the oldest done one gives way first.
export const FEED_CAP = 4
export const withCall = (feed: readonly FocusAction[], call: FocusAction, cap = FEED_CAP): FocusAction[] => {
  const next = [...feed, call]
  while (next.length > cap) {
    const oldestDone = next.findIndex(a => a.doneAt != null)
    next.splice(oldestDone === -1 ? 0 : oldestDone, 1)
  }
  return next
}
// A call's end: stamped, marked failed when it errored or was refused, and
// what it printed kept for its row to open on.
export const withCallDone = (feed: readonly FocusAction[], id: number, at: number, end: { failed?: boolean; output?: FeedOutput } = {}): FocusAction[] =>
  feed.map(a => (a.id === id ? { ...a, doneAt: at, ...(end.failed ? { failed: true } : {}), ...(end.output === undefined ? {} : { output: end.output.lines, moreLines: end.output.more }) } : a))

// What an opened row shows: the call's input in full (the command, the
// path, the pattern) and the first lines of what it printed. Kept in the
// session's memory only, bounded: the band shows FEED_DETAIL_LINES of them.
export const FEED_DETAIL_LINES = 8
const KEPT_LINES = 12
const KEPT_LINE_CHARS = 300
export type FeedOutput = { lines: string[]; more: number }

export const detailOf = (tool: string, input: Record<string, unknown>): string => {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const text =
    tool === 'Bash' || tool === 'PowerShell'
      ? str('command')
      : str('file_path') || str('notebook_path') || [str('pattern'), str('path')].filter(s => s !== '').join('  ') || str('url') || str('query') || str('prompt') || str('description')
  return text.split(/\r?\n/).slice(0, 3).join('\n').slice(0, KEPT_LINE_CHARS)
}

// Lines of a tool's result: a shell's output, a read file's text, a string;
// any other record in brief, its long strings cut; an image as a word.
export const outputOf = (result: unknown): FeedOutput => {
  let text = ''
  if (typeof result === 'string') text = result
  else if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>
    const file = r.file as Record<string, unknown> | undefined
    if (typeof r.stdout === 'string' || typeof r.stderr === 'string')
      text = [r.stdout, r.stderr].flatMap(s => (typeof s === 'string' && s.trim() !== '' ? [s.replace(/\s+$/, '')] : [])).join('\n')
    else if (r.type === 'image') text = '[image]'
    else if (typeof file?.content === 'string') text = file.content
    else text = JSON.stringify(result, (_, v: unknown) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}…` : v), 1) ?? ''
  }
  const lines = text.replace(/\s+$/, '').split(/\r?\n/)
  const shown = text.trim() === '' ? [] : lines.slice(0, KEPT_LINES).map(l => l.slice(0, KEPT_LINE_CHARS))
  return { lines: shown, more: Math.max(0, (text.trim() === '' ? 0 : lines.length) - shown.length) }
}

// The word for a turn that ended without an answer.
export const stopLabel = (stop: TurnStop): string => (stop === 'aborted' ? 'Interrupted' : stop === 'refusal' ? 'Refused' : 'Error')
// The `rows` calls the band draws: every one under way first, then the
// newest done ones, back in the order they started.
export const feedInView = (feed: readonly FocusAction[], rows: number): FocusAction[] => {
  const running = feed.filter(a => a.doneAt == null)
  const done = feed.filter(a => a.doneAt != null)
  const room = rows - Math.min(rows, running.length)
  const picked = new Set([...running.slice(-rows), ...(room > 0 ? done.slice(-room) : [])])
  return feed.filter(a => picked.has(a))
}

// Done steps over all steps, in whole percent; a finished task is 100.
export const progressOf = (t: FocusTask): number => {
  const total = t.steps.length
  if (t.doneAt !== null) return 100
  return total === 0 ? 0 : Math.round((100 * doneCount(t)) / total)
}

// "Step 3 of 7": the running step's number, else the first one not done.
// A finished task reads Done, or how its last turn stopped.
export const stepCaption = (t: FocusTask): string => {
  const finished = t.doneAt !== null
  if (finished) return t.stoppedBy ? stopLabel(t.stoppedBy) : 'Done'
  const total = t.steps.length
  if (total === 0) return 'Working…'
  const running = t.steps.findIndex(s => s.status === 'in_progress')
  const number = (running >= 0 ? running : doneCount(t)) + 1
  return `Step ${Math.min(total, number)} of ${total}`
}

export type BarRun = { color: string; cells: number }

// The filled cells of a bar `width` wide at `percent`, as runs of color:
// one run in the band's color, or the rainbow cut into eight equal bands.
export const barRuns = (theme: FocusTheme, color: string, width: number, percent: number): { filled: number; runs: BarRun[] } => {
  const share = Math.max(0, Math.min(100, percent)) / 100
  const filled = Math.round(width * share)
  if (theme !== 'rainbow') return { filled, runs: filled > 0 ? [{ color, cells: filled }] : [] }
  const edges = RAINBOW.map((_, i) => Math.floor((width * i) / RAINBOW.length))
  edges.push(width)
  const runs = RAINBOW.map((c, i) => ({ color: c, cells: Math.max(0, Math.min(edges[i + 1]!, filled) - edges[i]!) })).filter(run => run.cells > 0)
  return { filled, runs }
}

// The steps the band shows: up to `room` of them, the running one kept a
// couple of rows from the top so what comes next is in view.
export const stepsInView = (t: FocusTask, room = 6): FocusStep[] => {
  const running = t.steps.findIndex(s => s.status === 'in_progress')
  const lastStart = Math.max(0, t.steps.length - room)
  const anchor = running < 0 ? 0 : running - 2
  const first = Math.max(0, Math.min(anchor, lastStart))
  const last = first + room
  return t.steps.slice(first, last)
}

// Claude's todo list as steps: the active form while a todo runs.
export const stepsFromTodos = (todos: readonly { content: string; status: string; activeForm: string }[]): FocusStep[] =>
  todos.map((todo, i) => {
    const running = todo.status === 'in_progress'
    const text = running && todo.activeForm !== '' ? todo.activeForm : todo.content
    return { id: `todo-${i}`, text, status: toStatus(todo.status) }
  })

// Step clocks: a step entering in_progress is stamped; one completing with
// no start takes the latest finish before it, or the task's start, like a
// relay. Earlier stamps are kept by id, else by text; a pending step has none.
export const stampSteps = (prev: readonly FocusStep[], next: readonly FocusStep[], now: number, taskStart: number): FocusStep[] => {
  const lastDone = Math.max(taskStart, ...prev.flatMap(s => (s.doneAt === undefined ? [] : [s.doneAt])))
  return next.map(step => {
    const before = prev.find(s => s.id === step.id) ?? prev.find(s => s.text === step.text)
    let startedAt = before?.startedAt
    let doneAt = before?.doneAt
    if (step.status === 'in_progress') {
      startedAt ??= now
      doneAt = undefined
    } else if (step.status === 'completed') {
      startedAt ??= lastDone
      doneAt ??= now
    } else {
      startedAt = undefined
      doneAt = undefined
    }
    const { startedAt: _s, doneAt: _d, ...bare } = step
    return { ...bare, ...(startedAt === undefined ? {} : { startedAt }), ...(doneAt === undefined ? {} : { doneAt }) }
  })
}

// What a step's row shows at the right: its duration once done, the time so far while running.
export const stepTime = (step: FocusStep, now: number): string =>
  step.status === 'completed' && step.startedAt !== undefined && step.doneAt !== undefined
    ? clockText(step.doneAt - step.startedAt)
    : step.status === 'in_progress' && step.startedAt !== undefined
      ? clockText(now - step.startedAt)
      : ''

// A row's dot by state: green done, the Focus color running, gray pending.
// Only the running row is tinted, a shade of the Focus color over black (or
// over white on the light theme), so the band reads in its own color and
// the green stays on the dots.
export const STEP_GREEN = '#22c55e'
export const STEP_GRAY = '#6b7280'
export const stepColor = (status: StepStatus, bar: string): string => (status === 'completed' ? STEP_GREEN : status === 'in_progress' ? bar : STEP_GRAY)
export const stepTint = (status: StepStatus, bar: string, isLightTheme: boolean): string | undefined =>
  status === 'in_progress' ? blend(isLightTheme ? '#ffffff' : '#000000', bar, isLightTheme ? 0.18 : 0.22) : undefined

// The task's clock: paused time left out, frozen while waiting or done.
export const taskElapsed = (t: FocusTask, now: number): number => (t.doneAt ?? t.waitingAt ?? now) - t.startedAt - (t.pausedMs ?? 0)

export const isWaiting = (t: FocusTask): boolean => t.waitingAt !== null && t.waitingAt !== undefined

// A plan approved for this conversation: the main loop's own call, answered,
// with a plan in it, not a subagent's and not one still waiting on a leader.
export const isApprovedPlan = (e: { agentId?: string }, ran: { deny?: unknown; isError?: unknown; result?: unknown }): string | null => {
  if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return null
  const r = ran.result as { plan?: unknown; isAgent?: unknown; awaitingLeaderApproval?: unknown } | undefined
  if (r === undefined || typeof r.plan !== 'string' || r.plan.trim() === '') return null
  if (r.isAgent === true || r.awaitingLeaderApproval === true) return null
  return r.plan
}

// The steps a plan's Markdown holds: fenced code dropped, every top-level
// list item in order (numbered, bulleted, or a checkbox, a checked one
// done), the headings when there are no items at all. The title is the first
// heading. Fewer than two items: no steps, the title alone.
export const parsePlanSteps = (markdown: string): { title: string | null; steps: FocusStep[] } => {
  const text = markdown.replace(/```[\s\S]*?```/g, '')
  const lines = text.split(/\r?\n/)
  const title = lines.map(l => l.match(/^#\s+(.+?)\s*$/)?.[1] ?? null).find(t => t !== null) ?? null
  const items: { text: string; done: boolean }[] = []
  for (const line of lines) {
    const m = line.match(/^(?:\d+[.)]|[-*+])\s+(?:\[([ xX])\]\s+)?(.+?)\s*$/)
    if (m !== null && m[2] !== undefined) items.push({ text: m[2], done: m[1] !== undefined && m[1] !== ' ' })
  }
  const picked =
    items.length > 0
      ? items
      : lines.flatMap(l => {
          const h = l.match(/^#{2,}\s+(.+?)\s*$/)
          return h?.[1] === undefined ? [] : [{ text: h[1], done: false }]
        })
  if (picked.length < 2) return { title, steps: [] }
  return { title, steps: picked.map((it, i) => ({ id: `plan-${i}`, text: it.text, status: it.done ? 'completed' : 'pending' })) }
}

// The "now" line's words for a tool call: the tool and what it is on.
export const actionOf = (tool: string, input: Record<string, unknown>, startedAt: number): Omit<FocusAction, 'id'> => {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const base = (path: string) => path.split(/[\\/]/).pop() ?? path
  const mcp = tool.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/)
  const name = mcp ? `${mcp[1]}:${mcp[2]}` : tool
  let target = ''
  if (tool === 'Bash' || tool === 'PowerShell') target = str('description') || str('command').split('\n')[0] || ''
  else if (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') target = base(str('file_path') || str('notebook_path'))
  else if (tool === 'Grep' || tool === 'Glob') target = str('pattern')
  else if (tool === 'Agent' || tool === 'Task') target = str('description')
  else if (tool === 'WebFetch' || tool === 'WebSearch') target = str('url') || str('query')
  return { tool: name, target: target.slice(0, 60), startedAt }
}
