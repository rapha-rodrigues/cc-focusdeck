import { describe, expect, test } from 'claude-code/testing'

import {
  actionOf,
  bandColors,
  barRuns,
  clockText,
  isApprovedPlan,
  parsePlanSteps,
  progressOf,
  stampSteps,
  stepCaption,
  stepsFromTodos,
  stepsInView,
  stepTime,
  stepTint,
  taskElapsed,
  toStatus,
  feedInView,
  canPost,
  detailOf,
  endsOnLastStep,
  FOCUS_MARKER,
  FOCUS_TOOL,
  FOCUS_TOOL_DESCRIPTION,
  MAX_STEPS,
  outputOf,
  progressPost,
  progressReply,
  stepsAfterPost,
  withCall,
  withCallDone,
} from '../hooks/lib/focus'
import type { FocusTask, StepStatus } from '../types'

const taskOf = (...statuses: StepStatus[]): FocusTask => ({
  title: 'build it',
  startedAt: 0,
  doneAt: null,
  steps: statuses.map((status, i) => ({ id: `s${i}`, text: `step ${i + 1}`, status })),
})

describe('focus arithmetic', () => {
  test('progress and the caption follow the steps', () => {
    const t = taskOf('completed', 'in_progress', 'pending', 'pending')
    expect(progressOf(t)).toBe(25)
    expect(stepCaption(t)).toBe('Step 2 of 4')
    expect(progressOf(taskOf())).toBe(0)
    expect(stepCaption(taskOf())).toBe('Working…')
    expect(progressOf({ ...t, doneAt: 9 })).toBe(100)
    expect(stepCaption({ ...t, doneAt: 9 })).toBe('Done')
    // A task whose last turn ended without an answer says how it stopped.
    expect(stepCaption({ ...taskOf(), doneAt: 9, stoppedBy: 'aborted' })).toBe('Interrupted')
    expect(stepCaption({ ...taskOf(), doneAt: 9, stoppedBy: 'error' })).toBe('Error')
    expect(stepCaption({ ...taskOf(), doneAt: 9, stoppedBy: 'refusal' })).toBe('Refused')
    // Without a running step the caption points at the first one not done.
    expect(stepCaption(taskOf('completed', 'completed', 'pending'))).toBe('Step 3 of 3')
    expect(stepCaption(taskOf('completed', 'completed'))).toBe('Step 2 of 2')
  })

  test('the bar fills whole cells, in one color or eight', () => {
    expect(barRuns('blue', '#60a5fa', 40, 50)).toEqual({ filled: 20, runs: [{ color: '#60a5fa', cells: 20 }] })
    expect(barRuns('green', '#4ade80', 40, 0)).toEqual({ filled: 0, runs: [] })
    expect(barRuns('green', '#4ade80', 10, 250).filled).toBe(10)
    const full = barRuns('rainbow', '', 40, 100)
    expect(full.runs).toHaveLength(8)
    expect(full.runs.reduce((n, r) => n + r.cells, 0)).toBe(40)
    const half = barRuns('rainbow', '', 40, 50)
    expect(half.runs.reduce((n, r) => n + r.cells, 0)).toBe(20)
    expect(half.runs.length).toBeLessThan(8)
  })

  test('the window keeps the running step near the top and never runs past the end', () => {
    const long = taskOf(...Array<StepStatus>(5).fill('completed'), 'in_progress', 'pending', 'pending', 'pending', 'pending')
    const shown = stepsInView(long)
    expect(shown).toHaveLength(6)
    expect(shown[2]?.status).toBe('in_progress')
    expect(stepsInView(taskOf('pending', 'pending'))).toHaveLength(2)
    const tail = taskOf(...Array<StepStatus>(8).fill('completed'), 'in_progress')
    expect(stepsInView(tail).map(s => s.id)).toEqual(['s3', 's4', 's5', 's6', 's7', 's8'])
  })

  test('todos become steps, the active form while one runs; a clock reads in seconds and minutes', () => {
    const steps = stepsFromTodos([
      { content: 'Plan', status: 'completed', activeForm: 'Planning' },
      { content: 'Build', status: 'in_progress', activeForm: 'Building' },
      { content: 'Ship', status: 'odd', activeForm: '' },
    ])
    expect(steps.map(s => [s.id, s.text, s.status])).toEqual([
      ['todo-0', 'Plan', 'completed'],
      ['todo-1', 'Building', 'in_progress'],
      ['todo-2', 'Ship', 'pending'],
    ])
    expect(toStatus('in_progress')).toBe('in_progress')
    expect(toStatus('whatever')).toBe('pending')
    expect(clockText(0)).toBe('0s')
    expect(clockText(59_999)).toBe('59s')
    expect(clockText(65_000)).toBe('1m 5s')
    expect(bandColors('custom', { bar: '#1', text: '#2', border: '#3' })).toEqual({ bar: '#1', text: '#2', border: '#3' })
    expect(bandColors('light', { bar: '#1', text: '#2', border: '#3' }).text).toBe('text')
  })

  test('step clocks: running stamps a start, done stamps an end, a relay from the finish before', () => {
    const a = { id: 'a', text: 'A', status: 'in_progress' as const }
    const b = { id: 'b', text: 'B', status: 'pending' as const }
    const c = { id: 'c', text: 'C', status: 'pending' as const }
    const first = stampSteps([], [a, b, c], 10_000, 0)
    expect(first[0]).toMatchObject({ startedAt: 10_000 })
    expect(first[0]).not.toHaveProperty('doneAt')
    expect(first[1]).not.toHaveProperty('startedAt')
    const second = stampSteps(first, [{ ...a, status: 'completed' }, { ...b, status: 'in_progress' }, c], 25_000, 0)
    expect(second[0]).toMatchObject({ startedAt: 10_000, doneAt: 25_000 })
    expect(second[1]).toMatchObject({ startedAt: 25_000 })
    const third = stampSteps(second, [{ ...a, status: 'completed' }, { ...b, status: 'completed' }, { ...c, status: 'completed' }], 40_000, 0)
    expect(third[1]).toMatchObject({ startedAt: 25_000, doneAt: 40_000 })
    expect(third[2]).toMatchObject({ startedAt: 25_000, doneAt: 40_000 })
    expect(stepTime(third[0]!, 99_000)).toBe('15s')
    expect(stepTime(second[1]!, 31_000)).toBe('6s')
    expect(stepTime(c, 31_000)).toBe('')
    const moved = stampSteps(second, [{ id: 'x', text: 'A', status: 'completed' }], 50_000, 0)
    expect(moved[0]).toMatchObject({ startedAt: 10_000, doneAt: 25_000 })
    // Only the running row is tinted, in the band's color; done and pending rows are not.
    expect(stepTint('in_progress', '#f472b6', false)).toMatch(/^#[0-9a-f]{6}$/)
    expect(stepTint('in_progress', '#f472b6', true)).not.toBe(stepTint('in_progress', '#f472b6', false))
    expect(stepTint('completed', '#f472b6', false)).toBeUndefined()
    expect(stepTint('pending', '#f472b6', true)).toBeUndefined()
  })

  test('a plan approved in plan mode is read by its structure, and only when it is this conversation\'s own', () => {
    const plan = ['# Ship the dashboard', '', 'prose', '```', '1. not a step', '```', '## Work', '1. Scaffold the page', '2. [x] Wire the data', '- [ ] Draw the charts', '   - a nested note', '* Test it', ''].join('\n')
    const parsed = parsePlanSteps(plan)
    expect(parsed.title).toBe('Ship the dashboard')
    expect(parsed.steps.map(st => [st.text, st.status])).toEqual([
      ['Scaffold the page', 'pending'],
      ['Wire the data', 'completed'],
      ['Draw the charts', 'pending'],
      ['Test it', 'pending'],
    ])
    expect(parsePlanSteps('# T\n## First\nprose\n## Second').steps.map(st => st.text)).toEqual(['First', 'Second'])
    expect(parsePlanSteps('# T\n- only one')).toEqual({ title: 'T', steps: [] })
    const ok = { result: { plan: '# P\n1. a\n2. b', isAgent: false } }
    expect(isApprovedPlan({}, ok)).toBe('# P\n1. a\n2. b')
    expect(isApprovedPlan({ agentId: 'sub' }, ok)).toBe(null)
    expect(isApprovedPlan({}, { ...ok, deny: 'no' })).toBe(null)
    expect(isApprovedPlan({}, { ...ok, isError: true })).toBe(null)
    expect(isApprovedPlan({}, { result: { plan: null } })).toBe(null)
    expect(isApprovedPlan({}, { result: { plan: '  ' } })).toBe(null)
    expect(isApprovedPlan({}, { result: { plan: 'x', isAgent: true } })).toBe(null)
    expect(isApprovedPlan({}, { result: { plan: 'x', awaitingLeaderApproval: true } })).toBe(null)
  })

  test('the now line names the tool and what it is on; the task clock leaves paused time out', () => {
    expect(actionOf('Bash', { command: 'npm test', description: 'Run the tests' }, 1)).toEqual({ tool: 'Bash', target: 'Run the tests', startedAt: 1 })
    expect(actionOf('Bash', { command: 'npm test\necho done' }, 1).target).toBe('npm test')
    expect(actionOf('Read', { file_path: '/a/b/app.ts' }, 1).target).toBe('app.ts')
    expect(actionOf('Grep', { pattern: 'TODO' }, 1).target).toBe('TODO')
    expect(actionOf('Agent', { description: 'Audit auth' }, 1).target).toBe('Audit auth')
    expect(actionOf('mcp__github__create_issue', {}, 1)).toEqual({ tool: 'github:create_issue', target: '', startedAt: 1 })
    expect(actionOf('Bash', { description: 'x'.repeat(80) }, 1).target).toHaveLength(60)
    const t: FocusTask = { title: 'x', startedAt: 10_000, doneAt: null, steps: [], waitingAt: null, pausedMs: 4_000 }
    expect(taskElapsed(t, 30_000)).toBe(16_000)
    expect(taskElapsed({ ...t, waitingAt: 20_000 }, 30_000)).toBe(6_000)
    expect(taskElapsed({ ...t, doneAt: 25_000 }, 30_000)).toBe(11_000)
  })
})

describe('focus progress', () => {
  test('the tool and the line beside each prompt: short, and the description says to post the plan once and then step numbers alongside real calls', async () => {
    expect(FOCUS_MARKER).toContain(FOCUS_TOOL)
    expect(FOCUS_MARKER.length).toBeLessThan(200)
    expect(FOCUS_TOOL_DESCRIPTION.length).toBeLessThan(1200)
    expect(FOCUS_TOOL_DESCRIPTION).toContain('more than two tool calls')
    expect(FOCUS_TOOL_DESCRIPTION).toContain('same message')
    expect(FOCUS_TOOL_DESCRIPTION).toContain('done: true')
    expect(FOCUS_TOOL_DESCRIPTION).toContain('never from a subagent')
  })

  test('a post is checked: steps trimmed and bounded, a step number from 1, done; nothing to apply is null', async () => {
    expect(progressPost({ steps: ['  Read the code ', '', 'Fix it', { text: 'Test it' }, 7], current: 1 })).toEqual({ title: null, steps: ['Read the code', 'Fix it', 'Test it'], current: 1, done: false })
    expect(progressPost({ current: 3 })).toEqual({ title: null, steps: null, current: 3, done: false })
    expect(progressPost({ done: true, title: ' Ship ' })).toEqual({ title: 'Ship', steps: null, current: null, done: true })
    expect(progressPost({ steps: Array.from({ length: 30 }, (_, i) => `s${i}`) })?.steps).toHaveLength(MAX_STEPS)
    expect(progressPost({ steps: ['x'.repeat(200)] })?.steps?.[0]).toHaveLength(80)
    for (const empty of [{}, { current: 0 }, { current: 1.5 }, { steps: [] }, { done: false }, null, 'steps']) expect(progressPost(empty)).toBeNull()
  })

  test('the plan, then step numbers: done before the current one, it running, the rest pending; done finishes all', async () => {
    const plan = progressPost({ steps: ['Read', 'Fix', 'Test'], current: 1 })!
    const first = stepsAfterPost([], plan)!
    expect(first.map(s => s.status)).toEqual(['in_progress', 'pending', 'pending'])
    expect(progressReply(first)).toBe('Band: step 1 of 3.')
    const second = stepsAfterPost(first, progressPost({ current: 2 })!)!
    expect(second.map(s => [s.text, s.status])).toEqual([['Read', 'completed'], ['Fix', 'in_progress'], ['Test', 'pending']])
    expect(second.map(s => s.id)).toEqual(first.map(s => s.id))
    const all = stepsAfterPost(second, progressPost({ done: true })!)!
    expect(all.every(s => s.status === 'completed')).toBe(true)
    expect(progressReply(all)).toBe('Band: 3 of 3 steps done.')
    // A number past the end is every step done; a number alone needs a plan on the band.
    expect(stepsAfterPost(first, progressPost({ current: 9 })!)!.every(s => s.status === 'completed')).toBe(true)
    expect(stepsAfterPost([], progressPost({ current: 2 })!)).toBeNull()
    // A plan with no number: a fresh one starts at its first step, a revised
    // one keeps the states by text, and repeated texts get their own ids.
    expect(stepsAfterPost([], progressPost({ steps: ['A', 'B'] })!)!.map(s => s.status)).toEqual(['in_progress', 'pending'])
    const revised = stepsAfterPost(second, progressPost({ steps: ['Read', 'Fix', 'Lint', 'Test'] })!)!
    expect(revised.map(s => s.status)).toEqual(['completed', 'in_progress', 'pending', 'pending'])
    expect(new Set(stepsAfterPost([], progressPost({ steps: ['A', 'A'] })!)!.map(s => s.id)).size).toBe(2)
    // A plan from another source is advanced by number too.
    const fromPlan = [{ id: 'plan-0', text: 'One', status: 'pending' as const }, { id: 'plan-1', text: 'Two', status: 'pending' as const }]
    expect(stepsAfterPost(fromPlan, progressPost({ current: 2 })!)!.map(s => s.status)).toEqual(['completed', 'in_progress'])
  })

  test('a turn that answers on the last step of a focus_progress plan finishes it; earlier, or another source, it does not', async () => {
    const t = (source: FocusTask['source'], ...statuses: StepStatus[]): FocusTask => ({ ...taskOf(...statuses), source })
    expect(endsOnLastStep(t('progress', 'completed', 'completed', 'in_progress'))).toBe(true)
    expect(endsOnLastStep(t('progress', 'completed', 'in_progress', 'pending'))).toBe(false)
    expect(endsOnLastStep(t('progress', 'pending', 'completed', 'in_progress'))).toBe(false)
    expect(endsOnLastStep(t('todo', 'completed', 'in_progress'))).toBe(false)
    expect(endsOnLastStep(t('progress'))).toBe(false)
    expect(FOCUS_TOOL_DESCRIPTION).toContain('send nothing to close it')
  })

  test('the band\'s own tool owns a task once it posts; the other sources give way to it', async () => {
    expect(canPost('todo', undefined)).toBe(true)
    expect(canPost('plan', 'todo')).toBe(true)
    expect(canPost('progress', 'plan')).toBe(true)
    expect(canPost('todo', 'progress')).toBe(false)
    expect(canPost('tasks', 'progress')).toBe(false)
    expect(canPost('progress', 'progress')).toBe(true)
  })

  test('a call\'s detail and output: the command or the target, the first lines it printed, the rest counted', async () => {
    expect(detailOf('Bash', { command: 'npm test\nnpm run lint\necho a\necho b', description: 'Run the tests' })).toBe('npm test\nnpm run lint\necho a')
    expect(detailOf('Edit', { file_path: '/p/hooks/a.ts', old_string: 'x', new_string: 'y' })).toBe('/p/hooks/a.ts')
    expect(detailOf('Grep', { pattern: 'TODO', path: 'src' })).toBe('TODO  src')
    expect(outputOf({ stdout: 'ok\n', stderr: 'warn', interrupted: false })).toEqual({ lines: ['ok', 'warn'], more: 0 })
    expect(outputOf({ type: 'text', file: { filePath: '/a', content: 'one\ntwo', numLines: 2, startLine: 1, totalLines: 2 } })).toEqual({ lines: ['one', 'two'], more: 0 })
    expect(outputOf({ type: 'image', file: { base64: 'x'.repeat(5000) } })).toEqual({ lines: ['[image]'], more: 0 })
    expect(outputOf('')).toEqual({ lines: [], more: 0 })
    const long = outputOf(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'))
    expect(long.lines).toHaveLength(12)
    expect(long.more).toBe(18)
    // Any other record in brief: its long strings cut.
    expect(outputOf({ content: 'y'.repeat(500) }).lines.join('\n')).not.toContain('y'.repeat(200))
  })

  test('the feed keeps the last four calls, oldest first, and stamps one done by its id', async () => {
    const call = (id: number) => ({ id, tool: 'Bash', target: `c${id}`, startedAt: id })
    let feed = withCall([], call(1))
    for (const id of [2, 3, 4, 5]) feed = withCall(feed, call(id))
    expect(feed.map(a => a.id)).toEqual([2, 3, 4, 5])
    feed = withCallDone(feed, 4, 40)
    expect(feed.find(a => a.id === 4)?.doneAt).toBe(40)
    expect(feed.find(a => a.id === 5)?.doneAt).toBeUndefined()
    expect(withCallDone(feed, 9, 1)).toEqual(feed)
    // A failed call is marked, and what it printed is kept for its row.
    const failed = withCallDone(feed, 5, 50, { failed: true, output: { lines: ['boom'], more: 3 } }).find(a => a.id === 5)
    expect(failed).toMatchObject({ doneAt: 50, failed: true, output: ['boom'], moreLines: 3 })
    // A slow call under way is not pushed out by quick ones that came after
    // it: the oldest done one goes first, and the view shows running ones first.
    let slow = [call(1)]
    for (const id of [2, 3, 4, 5, 6]) slow = withCallDone(withCall(slow, call(id)), id, id * 10)
    expect(slow.map(a => a.id)).toEqual([1, 4, 5, 6])
    expect(feedInView(slow, 2).map(a => a.id)).toEqual([1, 6])
    expect(feedInView(slow, 4).map(a => a.id)).toEqual([1, 4, 5, 6])
    expect(feedInView([call(7), call(8), call(9)], 2).map(a => a.id)).toEqual([8, 9])
  })
})
