import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { EFFORT_TINT } from '../hooks/lib/session-controls'

const PLUGIN = 'cc-focusdeck'

// The three drawings the plugin owns: the band above the prompt, the pane, the row under the prompt.
const bandAt = (bodyColumns = 80) => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {} },
})
const paneAt = {
  component: 'Pane' as const,
  requestId: 'cc-focusdeck',
  props: { title: 'focusdeck', isFocused: true, bodyColumns: 56, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 26 }, view: {} },
}
const hintAt = { component: 'PromptHint' as const, props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } }

// A theme file of this test's own, parameterized by name and background.
const themeYaml = (name: string, background: string) =>
  [
    `name: ${name}`,
    'accent: "#5ec4d6"',
    `background: "${background}"`,
    'foreground: "#e6e1d6"',
    'terminal_colors:',
    '  normal:',
    ...['#1b2530', '#d9534f', '#7fb069', '#e3b341', '#4f8fc9', '#b388eb', '#5ec4d6', '#e6e1d6'].map((c, i) => `    ${['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'][i]}: "${c}"`),
    '  bright:',
    ...['#55657a', '#ff7b72', '#a6e3a1', '#f9e2af', '#89b4fa', '#cba6f7', '#94e2d5', '#ffffff'].map((c, i) => `    ${['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'][i]}: "${c}"`),
    '',
  ].join('\n')

// The least an engine beneath needs for the pane to draw.
const bareEngine = (on: On) => {
  mock.store(on)
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mountAll = async ($: any) => ({
  hint: await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hintAt }),
  pane: await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...paneAt }),
})

type Found = { find: (q: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }
// The color of a chip's frame; a chip is picked when it is the accent color.
const frameColor = async (pane: Found, key: string) => (await pane.find({ key: `${key}-box` }))?.props.borderColor
const picked = async (pane: Found, key: string) => (await frameColor(pane, key)) === 'claude'
// The bar colors the Focus color chip is painted in.
const BAR = { blue: '#60a5fa', rainbow: '#f87171' }

describe('the pane', () => {
  test('the Model button opens the pane on Model with its two tabs, on the terminal and the desktop', async ($, on) => {
    bareEngine(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const hint = await $.ui.mount({ plugin: PLUGIN, surface, ...hintAt })
      const pane = await $.ui.mount({ plugin: PLUGIN, surface, ...paneAt })
      expect((await hint.find({ key: 'focusdeck-toggle' }))?.text).toMatch(/Model ▲/)
      expect(await pane.find({ key: 'tab-model' })).toBeUndefined()
      await hint.press({ key: 'focusdeck-toggle' })
      expect((await hint.find({ key: 'focusdeck-toggle' }))?.text).toMatch(/▼/)
      for (const key of ['tab-model', 'tab-settings', 'focusdeck-close']) expect(await pane.find({ key })).toBeDefined()
      expect((await pane.find({ key: 'tab-model' }))?.text).toMatch(/◆ Model/)
      expect((await pane.find({ key: 'tab-settings' }))?.text).not.toMatch(/◆/)
      await hint.press({ key: 'focusdeck-toggle' })
      await hint.unmount()
      await pane.unmount()
    }
  })

  test('the hint row keeps what the engine and the other mods draw there, the Model button beside it', async ($, on) => {
    bareEngine(on)
    const { hint } = await mountAll($)
    expect(await hint.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    expect(await hint.find({ key: 'focusdeck-toggle' })).toBeDefined()
  })

  test('no language row: the pane speaks English', async ($, on) => {
    bareEngine(on)
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    expect((await pane.find({ key: 'focus-on' }))?.text).toMatch(/On/)
    expect(await pane.find({ key: 'lang-pt' })).toBeUndefined()
    expect(await pane.find({ key: 'lang-en' })).toBeUndefined()
  })

  test('Settings: Focus with its color chip, the Theme row, the status line chip, the icon sets last', async ($, on) => {
    bareEngine(on)
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    const keys = (await pane.findAll({ type: 'Button' })).map((b: { key?: string }) => b.key).filter((k?: string) => k?.startsWith('focus-') || k?.startsWith('settings-'))
    expect(keys).toEqual(['focus-on', 'focus-off', 'focus-band', 'settings-theme', 'settings-statusline', 'settings-icons-auto', 'settings-icons-nerd', 'settings-icons-unicode'])
    expect((await pane.find({ key: 'settings-theme' }))?.text).toBe('Terminal default')
    expect(await picked(pane, 'settings-theme')).toBe(false)
    expect((await pane.find({ key: 'settings-statusline' }))?.text).toBe('ccstatusline')
    expect(await picked(pane, 'settings-statusline')).toBe(false)
  })

  test('Focus is switched on Settings; its color chip, painted in that color, opens a page of its own, Settings still lit', async ($, on) => {
    bareEngine(on)
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })
    expect(await picked(pane, 'focus-on')).toBe(true)
    expect(await frameColor(pane, 'focus-band')).toBe(BAR.blue)
    await pane.press({ key: 'focus-band' })
    await pane.press({ key: 'focus-theme-rainbow' })
    expect((await pane.find({ key: 'focus-theme-rainbow' }))?.text).toMatch(/rainbow ✓/)
    expect((await pane.find({ key: 'tab-settings' }))?.text).toMatch(/◆/)
    await pane.press({ key: 'focus-band-back' })
    expect(await frameColor(pane, 'focus-band')).toBe(BAR.rainbow)
    expect((await pane.find({ key: 'focus-band' }))?.text).toBe('Focus color')
    // The pick holds across tabs.
    await pane.press({ key: 'tab-model' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-band' })
    expect((await pane.find({ key: 'focus-theme-rainbow' }))?.text).toMatch(/rainbow ✓/)
    await pane.press({ key: 'focus-band-back' })
    await pane.press({ key: 'focus-off' })
    expect(await picked(pane, 'focus-off')).toBe(true)
  })
})

describe('the Model page', () => {
  test('the Model button jumps to the page, closes from it, and opens straight on it', async ($, on) => {
    bareEngine(on)
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    expect((await pane.find({ key: 'tab-model' }))?.text).toMatch(/◆/)
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) expect(await pane.find({ key: `effort:${level}` })).toBeDefined()
    expect((await pane.find({ key: 'start-mode:bypassPermissions' }))?.text).toMatch(/bypass permissions/)
    // No running-mode row: only the classic hook events carry the mode, and the plugin hooks none.
    expect(await pane.find({ text: /Running in/ })).toBeUndefined()
    expect(await pane.find({ text: /^shift\+tab switches the running session$/ })).toBeDefined()
    // From another tab the button jumps back to Model, then closes the pane, then opens it on Model.
    await pane.press({ key: 'tab-settings' })
    expect(await pane.find({ key: 'effort:low' })).toBeUndefined()
    await hint.press({ key: 'focusdeck-toggle' })
    expect((await pane.find({ key: 'tab-model' }))?.text).toMatch(/◆/)
    await hint.press({ key: 'focusdeck-toggle' })
    expect(await pane.find({ key: 'tab-model' })).toBeUndefined()
    await hint.press({ key: 'focusdeck-toggle' })
    expect((await pane.find({ key: 'tab-model' }))?.text).toMatch(/◆/)
    expect(await pane.find({ key: 'effort:low' })).toBeDefined()
  })

  test('an effort is a filled chip once picked; max is a rainbow word with a star', async ($, on) => {
    bareEngine(on)
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-model' })
    // An effort chip is framed in its own tint, not the accent.
    const frameOf = async (key: string) => (await pane.find({ key: `${key}-box` }))?.props.borderColor
    await pane.press({ key: 'effort:high' })
    expect((await pane.find({ key: 'effort:high' }))?.text).toBe(' high ')
    expect(await frameOf('effort:high')).toBe(EFFORT_TINT.high)
    await pane.press({ key: 'effort:max' })
    expect((await pane.find({ key: 'effort:max' }))?.text).toBe('✦ max')
    expect(await frameOf('effort:high')).toBeUndefined()
    expect(await frameOf('effort:max')).toBeDefined()
  })

  test('a model is switched through /model and marked once the session reports it', async ($, on) => {
    bareEngine(on)
    let reported = 'claude-opus-5-5'
    const asked: string[] = []
    on('command.run', { command: 'model' }, async (_$, e) => {
      asked.push(e.args)
      if (e.args === 'sonnet') reported = 'claude-sonnet-5-5'
      return { text: `Model is now ${e.args}` }
    })
    on('session.model', () => ({ value: reported }))
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-model' })
    for (const alias of ['fable', 'opus', 'sonnet', 'haiku']) expect(await pane.find({ key: `pick-model:${alias}` })).toBeDefined()
    expect(await pane.find({ key: 'model-reset' })).toBeDefined()
    await pane.press({ key: 'pick-model:sonnet' })
    expect(asked).toEqual(['sonnet'])
    expect(await picked(pane, 'pick-model:sonnet')).toBe(true)
  })
})

describe('kept settings', () => {
  // What a session's start reads beneath, with the store as it was kept.
  const keptEngine = (on: On) => {
    mock.store(on, { focusOn: true, focusTheme: 'rainbow', effort: 'medium' })
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.cwd', () => ({ value: '/home/me/p' }))
  }

  test('a /clear closes the pane and brings the kept Focus, effort and model back', async ($, on) => {
    keptEngine(on)
    const closedIds: string[] = []
    on('ui.close', (_$, e) => (closedIds.push(e.id), { value: undefined }))
    on('session.end', () => ({ sessionId: 's1' }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    expect(await picked(pane, 'focus-off')).toBe(true)
    // A /clear is seen at session.end (the classic SessionStart event does
    // not reach a user's mod everywhere): the pane closes, and the first
    // prompt of the fresh session brings the kept settings back.
    await $.session.end({ reason: 'clear' } as never)
    expect(closedIds).toEqual(['cc-focusdeck'])
    await $.prompt.submit({ text: 'please check the build again', wait: false, origin: { kind: 'composer' } })
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    expect(await picked(pane, 'focus-on')).toBe(true)
    expect(await frameColor(pane, 'focus-band')).toBe(BAR.rainbow)
    await pane.press({ key: 'tab-model' })
    expect((await pane.find({ key: 'effort:medium' }))?.text).toBe(' medium ')
    expect(await picked(pane, 'pick-model:sonnet')).toBe(true)
  })

  test('with no start event seen, the first prompt brings them back', async ($, on) => {
    keptEngine(on)
    on('ui.close', () => ({ value: undefined }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    expect(await picked(pane, 'focus-off')).toBe(true)
    await $.prompt.submit({ text: 'please check the build again', wait: false, origin: { kind: 'composer' } })
    expect(await picked(pane, 'focus-on')).toBe(true)
    expect(await frameColor(pane, 'focus-band')).toBe(BAR.rainbow)
    await pane.press({ key: 'tab-model' })
    expect((await pane.find({ key: 'effort:medium' }))?.text).toBe(' medium ')
  })
})

describe('the Theme page', () => {
  test('lists the kept themes in a window, keeps the footer, and paints the pane with the chosen background', async ($, on) => {
    mock.store(on)
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('ui.close', () => ({ value: undefined }))
    // Forty themes on disk, each with its own background.
    const slugs = Array.from({ length: 40 }, (_, i) => `harbor-${String(i).padStart(2, '0')}`)
    on('env.get', (_$, { name }) => ({ value: name === 'HOME' ? '/home/me' : undefined }))
    on('fs.exists', () => ({ value: true }))
    on('fs.list', () => ({ value: slugs.map(slug => ({ name: `${slug}.yaml`, kind: 'file' as const, size: 1, mtimeMs: 0 })) }) as never)
    on('fs.read', (_$, { path }) => {
      const file = path.split('/').pop()!
      return { value: file.endsWith('.yaml') ? themeYaml(file.replace('.yaml', ''), `#0000${file.slice(7, 9)}`) : '{"theme":"custom:cc-focusdeck"}' }
    })
    on('fs.write', () => ({ value: undefined }))
    on('config.list', () => ({ value: [{ key: 'theme', kind: 'enum', value: 'custom:cc-focusdeck', options: ['dark', 'custom:cc-focusdeck'] }] }) as never)
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
    // No start event seen: the first prompt refills the session from the store and the disk.
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    await $.prompt.submit({ text: 'please check the build again', wait: false, origin: { kind: 'composer' } })

    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    expect((await pane.find({ key: 'settings-theme' }))?.text).toMatch(/^(Terminal default|harbor-\d\d)$/)
    await pane.press({ key: 'settings-theme' })
    const rows = (await pane.findAll({ type: 'Button' })).filter((b: { key?: string }) => b.key?.startsWith('pick-theme:'))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(paneAt.props.scroll.bodyRows)
    expect(await pane.find({ key: 'focusdeck-close' })).toBeDefined()
    expect(await pane.find({ key: 'themes-back' })).toBeDefined()
    expect(await pane.find({ key: 'theme-default' })).toBeDefined()
    await pane.press({ key: 'pick-theme:harbor-03' })
    expect((await pane.find({ key: 'pick-theme:harbor-03' }))?.text).toMatch(/harbor-03 ✓/)
    expect(await pane.drawn()).toMatchObject({ props: { backgroundColor: '#000003' } })
  })
})

describe('the Focus band', () => {
  test("Claude's own todos fill it for free; the turn's end pauses it with steps pending and finishes it when all are done", async ($, on) => {
    bareEngine(on)
    const clock = mock.clock(on)
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.cwd', () => ({ value: '/home/me/p' }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    on('tool.call', { tool: 'TodoWrite' }, () => ({ result: 'ok' }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('turn.complete', (_, e) => ({ text: (e as { text?: string }).text ?? '' }))
    // A Bash call looks at the band while it runs: the now line is up then.
    let seen: string | undefined
    let band: { find: (q: { text: RegExp }) => Promise<{ text: string } | undefined> } | null = null
    on('tool.call', { tool: 'Bash' }, async () => {
      seen = (await band?.find({ text: /🧠 Bash/ }))?.text
      return { result: 'ok' }
    })
    const { hint, pane } = await mountAll($)
    const drawn = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...bandAt() })
    band = drawn
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })

    const submitted = await $.prompt.submit({ text: 'Build the dashboard', wait: false, origin: { kind: 'composer' } })
    expect((submitted.context ?? []).filter(c => c.includes('mcp__cc-focusdeck__focus_progress'))).toHaveLength(1)
    const todos =(...rows: [string, 'pending' | 'in_progress' | 'completed', string][]) =>
      $.tool.call({ tool: 'TodoWrite', todos: rows.map(([content, status, activeForm]) => ({ content, status, activeForm })) } as never)
    await todos(['Plan', 'completed', 'Planning'], ['Fetch data', 'in_progress', 'Fetching data'], ['Draw charts', 'pending', 'Drawing charts'], ['Test', 'completed', 'Testing'])
    expect(await drawn.find({ text: /Build the dashboard/ })).toBeDefined()
    expect(await drawn.find({ text: /50%/ })).toBeDefined()
    expect(await drawn.find({ text: /Step 2 of 4/ })).toBeDefined()
    expect(await drawn.find({ text: /Fetching data/ })).toBeDefined()
    // One mark a step: the brain until it is done, the check then.
    expect(await drawn.find({ text: /🧠\s+2/ })).toBeDefined()
    expect(await drawn.find({ text: /🧠\s+3/ })).toBeDefined()
    expect(await drawn.find({ text: /^✓\s+1$/ })).toBeDefined()
    expect(await drawn.find({ text: /Working/ })).toBeDefined()
    expect(await drawn.find({ text: /^0s$/ })).toBeDefined()
    expect(await drawn.find({ text: /Next/ })).toBeUndefined()
    await pane.press({ key: 'settings-icons-nerd' })
    expect(await drawn.find({ text: /\uEE9C\s+2/ })).toBeDefined()
    expect(await drawn.find({ text: /🧠/ })).toBeUndefined()
    // Back to Unicode: the feed's marks follow the icon set too.
    await pane.press({ key: 'settings-icons-unicode' })

    await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' } as never)
    expect(seen).toMatch(/🧠 Bash  Run the tests/)
    // Returned: it stays under the running step, done.
    expect(await drawn.find({ text: /🧠 Bash/ })).toBeUndefined()
    expect(await drawn.find({ text: /✓\s+Bash  Run the tests/ })).toBeDefined()

    // A subagent's own list, calls and end are not the band's.
    await $.tool.call({ tool: 'TodoWrite', agentId: 'a1', todos: [{ content: 'Agent step', status: 'in_progress', activeForm: 'Agent stepping' }] } as never)
    expect(await drawn.find({ text: /Agent step/ })).toBeUndefined()
    expect(await drawn.find({ text: /Fetching data/ })).toBeDefined()
    await $.turn.complete({ answer: '', reason: 'answer', text: 'agent done', agentId: 'a1' } as never)
    expect(await drawn.find({ text: /Paused/ })).toBeUndefined()
    expect(await drawn.find({ text: /✓\s+Bash  Run the tests/ })).toBeDefined()

    await clock.advance(5_000)
    await $.turn.complete({ answer: '', reason: 'answer', text: 'so far' } as never)
    expect(await drawn.find({ text: /Paused/ })).toBeDefined()
    expect(await drawn.find({ text: /^paused$/ })).toBeDefined()
    expect(await drawn.find({ text: /Fetching data/ })).toBeDefined()
    await clock.advance(10_000)
    await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
    expect(await drawn.find({ text: /Paused/ })).toBeUndefined()
    expect(await drawn.find({ text: /Build the dashboard/ })).toBeDefined()
    expect(await drawn.find({ text: /Fetching data/ })).toBeDefined()
    await todos(['Plan', 'completed', 'Planning'], ['Fetch data', 'completed', 'Fetching data'], ['Draw charts', 'completed', 'Drawing charts'], ['Test', 'completed', 'Testing'])
    await $.turn.complete({ answer: '', reason: 'answer', text: 'all done' } as never)
    expect(await drawn.find({ text: /100%/ })).toBeDefined()
    expect(await drawn.find({ text: /Done/ })).toBeDefined()
    await todos(['Plan', 'completed', 'Planning'], ['Fetch data', 'in_progress', 'Fetching data'], ['Draw charts', 'pending', 'Drawing charts'], ['Test', 'completed', 'Testing'], ['Docs', 'pending', 'Docs'], ['Review', 'pending', 'Review'], ['Ship', 'pending', 'Ship'])
    expect(await drawn.find({ text: /\+1 more · 2 done/ })).toBeDefined()
    expect(await drawn.find({ text: /Done/ })).toBeUndefined()
  })

  test('without a list the band shows the tool call under way, keeps the last one and counts them; no bar to fill', async ($, on) => {
    bareEngine(on)
    const clock = mock.clock(on)
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.cwd', () => ({ value: '/home/me/p' }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    on('turn.complete', (_, e) => ({ text: (e as { text?: string }).text ?? '' }))
    let seen: string | undefined
    let band: { find: (q: { text: RegExp }) => Promise<{ text: string } | undefined> } | null = null
    on('tool.call', { tool: 'Bash' }, async () => {
      seen = (await band?.find({ text: /^🧠 Bash/ }))?.text
      return { result: 'ok' }
    })
    on('tool.call', { tool: 'Edit' }, () => ({ result: 'ok' }))
    on('tool.list', () => ({ value: [] }))
    on('ui.invalidate', () => ({ value: undefined }))
    const { hint, pane } = await mountAll($)
    const drawn = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...bandAt() })
    band = drawn
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })

    await $.prompt.submit({ text: 'Reorganize the settings tab\nwith chips', wait: false, origin: { kind: 'composer' } })
    expect(await drawn.find({ text: /Reorganize the settings tab/ })).toBeDefined()
    expect(await drawn.find({ text: /Working…/ })).toBeDefined()
    expect(await drawn.find({ text: /%/ })).toBeUndefined()
    expect(await drawn.find({ text: /call/ })).toBeUndefined()
    // The title is the prompt: the brain is kept for the steps, here the calls.
    expect(await drawn.find({ text: /🧠/ })).toBeUndefined()
    expect(await drawn.find({ text: /✶ Reorganize the settings tab/ })).toBeDefined()

    // One mark a call: the brain while it runs, the check once it returns.
    await $.tool.call({ tool: 'Bash', command: 'cat -n frame.tsx', description: 'Read the frame' } as never)
    expect(seen).toMatch(/^🧠 Bash  Read the frame/)
    expect(await drawn.find({ text: /🧠/ })).toBeUndefined()
    // Returned: the call stays, marked done, and is counted.
    expect(await drawn.find({ text: /✓\s+Bash  Read the frame/ })).toBeDefined()
    expect(await drawn.find({ text: /1 call$/ })).toBeDefined()
    await $.tool.call({ tool: 'Edit', file_path: '/home/me/p/hooks/pages/settings.tsx', old_string: 'a', new_string: 'b' } as never)
    expect(await drawn.find({ text: /✓\s+Edit  settings.tsx/ })).toBeDefined()
    // The feed keeps the earlier call too, oldest first, four at most.
    expect(await drawn.find({ text: /✓\s+Bash  Read the frame/ })).toBeDefined()
    expect(await drawn.find({ text: /2 calls/ })).toBeDefined()
    for (const name of ['one.ts', 'two.ts', 'three.ts']) await $.tool.call({ tool: 'Edit', file_path: `/home/me/p/${name}`, old_string: 'a', new_string: 'b' } as never)
    expect(await drawn.find({ text: /Read the frame/ })).toBeUndefined()
    expect(await drawn.find({ text: /✓\s+Edit  settings.tsx/ })).toBeDefined()
    expect(await drawn.find({ text: /✓\s+Edit  three.ts/ })).toBeDefined()
    expect(await drawn.find({ text: /5 calls/ })).toBeDefined()
    // The Nerd Font set draws its own marks.
    await pane.press({ key: 'settings-icons-nerd' })
    expect(await drawn.find({ text: /\uF00C Edit  three.ts/ })).toBeDefined()
    expect(await drawn.find({ text: /✓/ })).toBeUndefined()
    await pane.press({ key: 'settings-icons-unicode' })

    await clock.advance(3_000)
    await $.turn.complete({ answer: '', reason: 'answer', text: 'done' } as never)
    expect(await drawn.find({ text: /Done/ })).toBeDefined()
    // The calls stay after the turn, open to inspection, until the next prompt.
    expect(await drawn.find({ text: /✓\s+Edit  three.ts/ })).toBeDefined()
    await clock.advance(20_000)
    expect(await drawn.find({ text: /✓\s+Edit  three.ts/ })).toBeDefined()
    await $.prompt.submit({ text: 'next thing', wait: false, origin: { kind: 'composer' } })
    expect(await drawn.find({ text: /Edit/ })).toBeUndefined()
  })

  test('a row opens on what its call ran and printed and closes again; a failed call is crossed', async ($, on) => {
    bareEngine(on)
    mock.clock(on)
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.cwd', () => ({ value: '/home/me/p' }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('tool.call', { tool: 'Bash' }, (_, e) =>
      (e as { command: string }).command === 'false'
        ? { deny: 'boom' }
        : { result: { stdout: Array.from({ length: 11 }, (_, i) => `line ${i + 1}`).join('\n'), stderr: '', interrupted: false } },
    )
    const { hint, pane } = await mountAll($)
    const drawn = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...bandAt() })
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })
    await $.prompt.submit({ text: 'Check the build', wait: false, origin: { kind: 'composer' } })

    await $.tool.call({ tool: 'Bash', command: 'npm run build', description: 'Build it' } as never)
    await $.tool.call({ tool: 'Bash', command: 'false', description: 'Fail on purpose' } as never)
    expect(await drawn.find({ text: /✓\s+Bash  Build it/ })).toBeDefined()
    expect(await drawn.find({ text: /✗\s+Bash  Fail on purpose/ })).toBeDefined()

    const row = await drawn.find({ type: 'Button', text: /Build it/ })
    expect(row?.key).toBeDefined()
    await drawn.press({ key: row!.key! })
    expect(await drawn.find({ text: /^\$ npm run build$/ })).toBeDefined()
    expect(await drawn.find({ text: /^line 1$/ })).toBeDefined()
    expect(await drawn.find({ text: /^line 8$/ })).toBeDefined()
    expect(await drawn.find({ text: /^line 9$/ })).toBeUndefined()
    expect(await drawn.find({ text: /3 more lines · ctrl\+o/ })).toBeDefined()
    // Another row opens in its place; pressed again, it closes.
    const failed = await drawn.find({ type: 'Button', text: /Fail on purpose/ })
    await drawn.press({ key: failed!.key! })
    expect(await drawn.find({ text: /^line 1$/ })).toBeUndefined()
    expect(await drawn.find({ text: /^boom$/ })).toBeDefined()
    await drawn.press({ key: failed!.key! })
    expect(await drawn.find({ text: /^boom$/ })).toBeUndefined()
  })

  test('focus_progress posts the plan and moves it a step at a time; behind ToolSearch while Focus is off, it changes nothing then, nor from a subagent', async ($, on) => {
    bareEngine(on)
    mock.clock(on)
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.cwd', () => ({ value: '/home/me/p' }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    on('turn.complete', (_, e) => ({ text: (e as { text?: string }).text ?? '' }))
    on('tool.call', { tool: 'TodoWrite' }, () => ({ result: 'ok' }))
    const invalidated: string[] = []
    on('ui.invalidate', (_, e) => {
      invalidated.push(e.event)
      return { value: undefined }
    })
    on('tool.describe', (_, e) => ({ description: e.description, isDeferred: true }))
    const describe = () => $.tool.describe({ tool: 'mcp__cc-focusdeck__focus_progress', description: 'as registered', provider: { plugin: PLUGIN, tier: 'user' } })
    const progress = async (input: Record<string, unknown>) => String(((await $.tool.call({ tool: 'mcp__cc-focusdeck__focus_progress', ...input } as never)) as { result?: unknown }).result)

    expect((await describe()).isDeferred).toBe(true)
    expect(await progress({ steps: ['A', 'B'], current: 1 })).toMatch(/Focus is off/)
    const { hint, pane } = await mountAll($)
    const drawn = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...bandAt() })
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })
    expect(invalidated.filter(e => e === 'tool.describe')).toHaveLength(1)
    const listed = await describe()
    expect(listed.isDeferred).toBe(false)
    expect(listed.description).toContain('same message')

    await $.prompt.submit({ text: 'Ship the report', wait: false, origin: { kind: 'composer' } })
    expect(await progress({ current: 2 })).toMatch(/send steps first/)
    expect(await progress({ steps: ['Read the data', 'Write the report', 'Check it'], current: 1 })).toBe('Band: step 1 of 3.')
    expect(await drawn.find({ text: /Step 1 of 3/ })).toBeDefined()
    expect(await drawn.find({ text: /Read the data/ })).toBeDefined()
    expect(await drawn.find({ text: /0%/ })).toBeDefined()
    expect(await progress({ current: 2 })).toBe('Band: step 2 of 3.')
    expect(await drawn.find({ text: /Step 2 of 3/ })).toBeDefined()
    expect(await drawn.find({ text: /33%/ })).toBeDefined()
    expect(await drawn.find({ text: /^✓\s+1$/ })).toBeDefined()
    // Its own calls are the band's business, not the feed's.
    expect(await drawn.find({ text: /focus_progress/ })).toBeUndefined()
    expect(await drawn.find({ text: /call/ })).toBeUndefined()

    // A subagent's call changes nothing; nor does a todo list once the tool owns the task.
    expect(await progress({ current: 3, agentId: 'a1' })).toMatch(/subagent/)
    await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Other plan', status: 'in_progress', activeForm: 'Other plan' }] } as never)
    expect(await drawn.find({ text: /Other plan/ })).toBeUndefined()
    expect(await drawn.find({ text: /Step 2 of 3/ })).toBeDefined()

    // The band stops a column short of the body (80): a glyph drawn wider than measured cannot wrap a line.
    const frame = (await drawn.findAll({ type: 'Box' })).find(b => b.props.borderStyle === 'round')
    expect(frame?.props.width).toBe(79)
    // Only the running row is tinted; the done one keeps its green dot alone.
    const tinted = async () => (await drawn.findAll({ type: 'Box' })).filter(b => b.props.backgroundColor !== undefined).length
    expect(await tinted()).toBe(1)

    expect(await progress({ done: true })).toBe('Band: 3 of 3 steps done.')
    expect(await drawn.find({ text: /100%/ })).toBeDefined()
    expect(await tinted()).toBe(0)
    await $.turn.complete({ answer: '', reason: 'answer', text: 'shipped' } as never)
    expect(await drawn.find({ text: /Done/ })).toBeDefined()

    // A turn that answers on the last step finishes it: no done call needed.
    await $.prompt.submit({ text: 'Tidy the notes', wait: false, origin: { kind: 'composer' } })
    await progress({ steps: ['Sort them', 'Merge them'], current: 1 })
    await progress({ current: 2 })
    await $.turn.complete({ answer: '', reason: 'answer', text: 'tidied' } as never)
    expect(await drawn.find({ text: /^Done\s*$/ })).toBeDefined()
    expect(await drawn.find({ text: /100%/ })).toBeDefined()
    expect(await drawn.find({ text: /^✓\s+2$/ })).toBeDefined()
    // Ending earlier, the band pauses; interrupted on the last step, it says so.
    await $.prompt.submit({ text: 'Two more', wait: false, origin: { kind: 'composer' } })
    await progress({ steps: ['One', 'Two'], current: 1 })
    await $.turn.complete({ answer: '', reason: 'answer', text: 'half' } as never)
    expect(await drawn.find({ text: /^Paused$/ })).toBeDefined()
    await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
    await progress({ current: 2 })
    await $.turn.complete({ answer: '', reason: 'aborted', text: '' } as never)
    expect(await drawn.find({ text: /^Interrupted$/ })).toBeDefined()
    expect(await drawn.find({ text: /^Done\s*$/ })).toBeUndefined()

    await pane.press({ key: 'focus-off' })
    expect((await describe()).isDeferred).toBe(true)
  })

  test('every prompt typed while Focus is on carries the one line about focus_progress; off, or a slash command, nothing', async ($, on) => {
    bareEngine(on)
    mock.clock(on)
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.cwd', () => ({ value: '/home/me/p' }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    on('ui.invalidate', () => ({ value: undefined }))
    const submit = (text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    expect((await submit('Fix all failing tests')).context ?? []).toHaveLength(0)

    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })
    const line = (r: { context?: readonly string[] }) => (r.context ?? []).filter(c => c.startsWith('Focus band is on:'))
    expect(line(await submit('Fix all failing tests'))).toHaveLength(1)
    expect(line(await submit('continue'))).toHaveLength(1)
    expect((await submit('/clear')).context ?? []).toHaveLength(0)
  })

  test('a turn that is interrupted, refused or fails with no list says so, never Done', async ($, on) => {
    bareEngine(on)
    mock.clock(on)
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.cwd', () => ({ value: '/home/me/p' }))
    on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
    on('turn.complete', (_, e) => ({ text: (e as { text?: string }).text ?? '' }))
    on('ui.invalidate', () => ({ value: undefined }))
    const { hint, pane } = await mountAll($)
    const drawn = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...bandAt() })
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })
    for (const [reason, word] of [['aborted', 'Interrupted'], ['refusal', 'Refused'], ['error', 'Error']] as const) {
      await $.prompt.submit({ text: 'Rename the module', wait: false, origin: { kind: 'composer' } })
      await $.turn.complete({ answer: '', reason, text: '' } as never)
      expect(await drawn.find({ text: new RegExp(`^${word}$`) })).toBeDefined()
      expect(await drawn.find({ text: /✗ Rename the module/ })).toBeDefined()
      expect(await drawn.find({ text: /Done/ })).toBeUndefined()
    }
  })

  test('tool rows are hidden while Focus is on, except in ctrl+o, a call that failed or was cut, a group with more than calls, and the background pill', async ($, on) => {
    bareEngine(on)
    on('ui.invalidate', () => ({ value: undefined }))
    const { hint, pane } = await mountAll($)
    await hint.press({ key: 'focusdeck-toggle' })
    await pane.press({ key: 'tab-settings' })
    await pane.press({ key: 'focus-on' })
    const row = { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false }
    const shows = async (component: string, props: Record<string, unknown>) => {
      const drawn = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component, props } as never)
      const seen = (await drawn.find({ text: /engine/ })) !== undefined
      await drawn.unmount()
      return seen
    }
    expect(await shows('ToolUse', row)).toBe(false)
    expect(await shows('ToolUse', { ...row, isExpanded: true })).toBe(true)
    expect(await shows('ToolUse', { ...row, isErrored: true })).toBe(true)
    expect(await shows('ToolUse', { ...row, isInterrupted: true })).toBe(true)
    expect(await shows('ToolResult', { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: false })).toBe(false)
    expect(await shows('ToolResult', { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: true })).toBe(true)
    expect(await shows('ToolResult', { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: false, isExpanded: true })).toBe(true)
    const group = { calls: [], isActive: false, isExpanded: false }
    expect(await shows('ToolGroup', { ...group, isCallsOnly: true })).toBe(false)
    expect(await shows('ToolGroup', { ...group, isCallsOnly: false })).toBe(true)
    expect(await shows('ToolGroup', { ...group, isCallsOnly: true, isExpanded: true })).toBe(true)
    expect(await shows('ToolProgress', { tool_use_id: 't1', kind: 'background_hint', hint: '(ctrl+b to run in background)' })).toBe(true)
    await pane.press({ key: 'focus-off' })
    expect(await shows('ToolUse', row)).toBe(true)
  })
})
