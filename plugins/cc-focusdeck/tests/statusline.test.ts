import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { classify, installBlock, sameBlock, summarizeConfig, versionCommand } from '../hooks/lib/ccstatusline'
import { replaceFileArgv, shellArgv, whichArgv } from '../hooks/lib/platform'

const PLUGIN = 'cc-focusdeck'
const HOME = '/home/someone'
const SETTINGS = `${HOME}/.claude/settings.json`
const CONFIG = `${HOME}/.config/ccstatusline/settings.json`

const pane = {
  component: 'Pane' as const,
  requestId: 'cc-focusdeck',
  props: { title: 'focusdeck', isFocused: true, bodyColumns: 56, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 26 }, view: {} },
}
const hint = { component: 'PromptHint' as const, props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } }

const OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

describe('ccstatusline, pure', () => {
  test('tells the status line setting apart', async () => {
    const block = installBlock()
    expect(classify(undefined, null)).toBe('none')
    expect(classify({ type: 'command', command: 'python ~/.claude/statusline.py' }, null)).toBe('other')
    expect(classify({ type: 'command', command: 'npx -y ccstatusline@latest', padding: 0 }, null)).toBe('unmanaged')
    expect(classify({ type: 'command', command: 'ccstatusline' }, null)).toBe('unmanaged')
    const op = { phase: 'installed' as const, predecessor: null, block, wroteConfig: true }
    expect(classify(block, op)).toBe('managed')
    // Key order does not matter; a changed field does.
    expect(classify({ refreshInterval: 10, padding: 0, command: block.command, type: 'command' }, op)).toBe('managed')
    expect(classify({ ...block, padding: 1 }, op)).toBe('unmanaged')
    expect(classify(block, { ...op, phase: 'installing' })).toBe('unmanaged')
    expect(sameBlock({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true)
  })

  test('summarizes a ccstatusline config and survives a broken one', async () => {
    const summary = summarizeConfig(JSON.stringify({ version: 4, lines: [[{ type: 'model' }, { type: 'context-bar' }], [{ type: 'git-branch' }]], powerline: { enabled: true } }))
    expect(summary).toEqual({ version: 4, lines: [['model', 'context-bar'], ['git-branch']], powerline: true })
    expect(summarizeConfig('{not json')).toBe(null)
    expect(summarizeConfig('{}')).toEqual({ version: null, lines: [], powerline: false })
  })

  test('runs the configured command for the version, through the platform shell', async () => {
    expect(versionCommand('npx -y ccstatusline@latest')).toBe('npx -y ccstatusline@latest --version')
    expect(shellArgv('ccstatusline --version', false)).toEqual(['sh', '-c', 'ccstatusline --version'])
    expect(shellArgv('ccstatusline --version', true)[0]).toBe('cmd')
    expect(whichArgv('npx', false).slice(-1)).toEqual(['npx'])
    expect(whichArgv('npx', true)).toEqual(['cmd', '/d', '/c', 'where', 'npx'])
    expect(replaceFileArgv('/x/settings.json', 'tok').slice(-2)).toEqual(['/x/settings.json', 'tok'])
    expect(replaceFileArgv('/x/settings.json')[2]).toContain('mkdir "$lock"')
    expect(replaceFileArgv('/x/settings.json')[2]).toContain('cp -p')
    // What the file must still be travels as a third argument, compared last, under the lock.
    expect(replaceFileArgv('/x/settings.json', 'tok', '-').slice(-3)).toEqual(['/x/settings.json', 'tok', '-'])
    const script = replaceFileArgv('/x/settings.json')[2]!
    expect(script.indexOf('cmp -s')).toBeGreaterThan(script.indexOf('mkdir "$lock"'))
    expect(script.indexOf('cmp -s')).toBeLessThan(script.indexOf('mv -f'))
  })

})

// The engine beneath: a settings file with `settings` in it, a ccstatusline
// config or not, tools on PATH or not, every write recorded.
type Beneath = { settings?: Record<string, unknown>; config?: string | null; tools?: string[]; store?: Record<string, unknown>; windows?: boolean }

const engineBeneath = (on: On, opts: Beneath) => {
  const files = new Map<string, string>()
  // Called before each read, and before each process runs: a test can change
  // a file between a page's read and its write, or after its last read.
  const steer: { onRead?: (path: string) => void; onRun?: (argv: string[]) => void } = {}
  if (opts.settings !== undefined) files.set(SETTINGS, JSON.stringify(opts.settings, null, 2) + '\n')
  if (opts.config) files.set(CONFIG, opts.config)
  const writes: { path: string; text: string }[] = []
  const runs: { argv: string[]; stdin?: string }[] = []
  mock.clock(on)
  mock.store(on, opts.store ?? {})
  mock.env(on, opts.windows ? { USERPROFILE: HOME, OS: 'Windows_NT' } : { HOME })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: `${HOME}/p` }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__${PLUGIN}__${e.name}` } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('config.list', () => ({ value: [] }) as never)
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => {
    steer.onRead?.(e.path)
    return { value: files.get(e.path) ?? '' }
  })
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    runs.push({ argv, stdin: e.init?.stdin })
    steer.onRun?.(argv)
    // `command -v <tool>` / `where <tool>`
    const tool = argv[0] === 'sh' && argv[2]?.startsWith('command -v') ? argv[4] : argv[0] === 'cmd' && argv[3] === 'where' ? argv[4] : null
    if (tool !== null) return { value: { ...OK, exitCode: (opts.tools ?? []).includes(tool!) ? 0 : 1 } }
    // a private file from stdin: the text a replace expects to find
    if (argv[0] === 'sh' && argv[2] === 'umask 077 && cat > "$1"') {
      files.set(argv[4]!, e.init?.stdin ?? '')
      return { value: OK }
    }
    // the one-step replace: the stdin lands in the file, unless the file is no
    // longer what the caller expected (the expect file goes either way)
    if (argv[0] === 'sh' && argv[2]?.includes('cat > "$tmp"')) {
      const expect = argv[6]
      if (expect !== undefined) {
        const now = files.get(argv[4]!)
        const changed = expect === '-' ? now !== undefined : now !== files.get(expect)
        if (expect !== '-') files.delete(expect)
        if (changed) return { value: { ...OK, exitCode: 76 } }
      }
      files.set(argv[4]!, e.init?.stdin ?? '')
      writes.push({ path: argv[4]!, text: e.init?.stdin ?? '' })
      return { value: OK }
    }
    // Windows: the sibling file moved over the target
    if (argv[0] === 'cmd' && argv[3] === 'move') {
      files.set(argv[6]!, files.get(argv[5]!) ?? '')
      files.delete(argv[5]!)
      writes.push({ path: argv[6]!, text: files.get(argv[6]!)! })
      return { value: OK }
    }
    if (argv.join(' ').includes('--version')) return { value: { ...OK, stdout: '2.2.32\n' } }
    return { value: OK }
  })
  return { files, writes, runs, steer }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = async ($: any) => {
  const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
  const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
  await corner.press({ key: 'focusdeck-toggle' })
  await menu.press({ key: 'tab-settings' })
  await menu.press({ key: 'settings-statusline' })
  return menu
}

describe('status line page', () => {
  test('an unmanaged ccstatusline offers the editor, the version check and the removal, the disclaimer last', async ($, on) => {
    engineBeneath(on, { settings: { statusLine: { type: 'command', command: 'npx -y ccstatusline@latest', padding: 0 } }, config: JSON.stringify({ version: 4, lines: [[{ type: 'model' }]], powerline: { enabled: true } }), tools: ['npx'] })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    // What the page is for comes first.
    expect(await menu.find({ type: 'Text', text: /status line under the prompt/ })).toBeDefined()
    for (const key of ['statusline-edit', 'statusline-version-check', 'statusline-remove', 'statusline-back']) expect(await menu.find({ key })).toBeDefined()
    for (const key of ['statusline-uninstall', 'statusline-install', 'statusline-open', 'statusline-copy']) expect(await menu.find({ key })).toBeUndefined()
    // No state, command or config lines: the chips say it.
    expect(await menu.find({ type: 'Text', text: /installed by you/ })).toBeUndefined()
    expect(await menu.find({ type: 'Text', text: /npx -y ccstatusline/ })).toBeUndefined()
    expect(await menu.find({ type: 'Text', text: /Lines:/ })).toBeUndefined()
    // The disclaimer, with the project's address, after the configurator's command.
    const texts: string[] = (await menu.findAll({ type: 'Text' })).map((el: { text: string }) => el.text)
    const command = texts.findIndex((x: string) => /npx ccstatusline@latest/.test(x))
    const about = texts.findIndex((x: string) => /third-party project by Matthew Breedlove/.test(x))
    const url = texts.findIndex((x: string) => /github\.com\/sirmalloc\/ccstatusline/.test(x))
    expect(command).toBeGreaterThanOrEqual(0)
    expect(about).toBeGreaterThan(command)
    expect(url).toBeGreaterThan(about)
    // Back on Settings, the ccstatusline chip is lit.
    await menu.press({ key: 'statusline-back' })
    expect((await menu.find({ key: 'settings-statusline-box' }))?.props.borderColor).toBe('claude')
  })

  test('Install records first, writes the starter config where none exists, then the setting; Uninstall puts the predecessor back', async ($, on) => {
    const { files, writes } = engineBeneath(on, { settings: { theme: 'dark', statusLine: { type: 'command', command: 'python3 ~/.claude/statusline.py' } }, config: null, tools: ['npx'] })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /Another status line/ })).toBeDefined()

    await menu.press({ key: 'statusline-install' })
    // The starter config first, then the backup, then the setting itself.
    expect(writes.map(w => w.path)).toEqual([CONFIG, `${SETTINGS}.cc-focusdeck.bak`, SETTINGS])
    const settings = JSON.parse(files.get(SETTINGS)!) as { theme: string; statusLine: { command: string } }
    expect(settings.theme).toBe('dark')
    expect(settings.statusLine.command).toBe('npx -y ccstatusline@latest')
    expect(JSON.parse(files.get(CONFIG)!)).toMatchObject({ version: 4, powerline: { enabled: true } })
    expect(await menu.find({ key: 'statusline-edit' })).toBeDefined()
    expect(await menu.find({ key: 'statusline-uninstall' })).toBeDefined()

    await menu.press({ key: 'statusline-uninstall' })
    const after = JSON.parse(files.get(SETTINGS)!) as { statusLine: { command: string } }
    expect(after.statusLine.command).toBe('python3 ~/.claude/statusline.py')
    expect(await menu.find({ type: 'Text', text: /Another status line/ })).toBeDefined()
  })

  test('a managed install changed outside the page is not uninstalled over', async ($, on) => {
    const block = installBlock()
    const { files } = engineBeneath(on, { settings: { statusLine: { ...block, padding: 2 } }, config: '{}', tools: ['npx'], store: { statusLineOp: { phase: 'installed', predecessor: null, block, wroteConfig: false } } })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    // Not the block that was written: unmanaged now, no Uninstall offered, the setting untouched.
    expect(await menu.find({ key: 'statusline-remove' })).toBeDefined()
    expect(await menu.find({ key: 'statusline-uninstall' })).toBeUndefined()
    expect(JSON.parse(files.get(SETTINGS)!)).toMatchObject({ statusLine: { padding: 2 } })
  })

  test('an Install interrupted before the setting was written is forgotten at the next start', async ($, on) => {
    const block = installBlock()
    engineBeneath(on, { settings: {}, config: '{}', tools: ['npx'], store: { statusLineOp: { phase: 'installing', predecessor: null, block, wroteConfig: true } } })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /Not installed/ })).toBeDefined()
    expect(await menu.find({ key: 'statusline-install' })).toBeDefined()
  })

  test('removing a status line the person set takes two presses and can be put back', async ($, on) => {
    const { files } = engineBeneath(on, { settings: { statusLine: { type: 'command', command: 'ccstatusline' } }, config: '{}', tools: ['npx', 'ccstatusline', 'wl-copy'] })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    await menu.press({ key: 'statusline-remove' })
    expect(JSON.parse(files.get(SETTINGS)!)).toMatchObject({ statusLine: { command: 'ccstatusline' } })
    expect((await menu.find({ key: 'statusline-remove' }))?.text).toMatch(/Press again/)
    await menu.press({ key: 'statusline-remove' })
    expect(JSON.parse(files.get(SETTINGS)!)).toEqual({})
    expect(await menu.find({ key: 'statusline-putback' })).toBeDefined()
    await menu.press({ key: 'statusline-putback' })
    expect(JSON.parse(files.get(SETTINGS)!)).toMatchObject({ statusLine: { command: 'ccstatusline' } })
  })

  test('the version check runs the configured command through the platform shell', async ($, on) => {
    const { runs } = engineBeneath(on, { settings: { statusLine: { type: 'command', command: 'ccstatusline' } }, config: '{}', tools: ['npx', 'ccstatusline'] })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    await menu.press({ key: 'statusline-version-check' })
    expect(runs.some(r => r.argv[0] === 'sh' && r.argv[2] === 'ccstatusline --version')).toBe(true)
    expect(await menu.find({ type: 'Text', text: /2\.2\.32/ })).toBeDefined()
  })

  test('a write is refused when settings.json changed in between', async ($, on) => {
    const { files, writes, steer } = engineBeneath(on, { settings: {}, config: '{}', tools: ['npx'] })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    // Something else writes the file between the page's read and its re-read before writing.
    let reads = 0
    steer.onRead = path => {
      if (path === SETTINGS && ++reads === 2) files.set(SETTINGS, '{"theme":"light"}\n')
    }
    await menu.press({ key: 'statusline-install' })
    expect(writes.filter(w => w.path === SETTINGS)).toHaveLength(0)
    expect(JSON.parse(files.get(SETTINGS)!)).toEqual({ theme: 'light' })
  })

  test('an edit that lands after the last read is kept: the replace compares under its lock and refuses', async ($, on) => {
    const { files, writes, steer } = engineBeneath(on, { settings: {}, config: '{}', tools: ['npx'] })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    // Something else writes the file once the page's reads are done, as the replace starts.
    steer.onRun = argv => {
      if (argv[2]?.includes('cat > "$tmp"')) files.set(SETTINGS, '{"theme":"light"}\n')
    }
    await menu.press({ key: 'statusline-install' })
    expect(writes.filter(w => w.path === SETTINGS)).toHaveLength(0)
    expect(JSON.parse(files.get(SETTINGS)!)).toEqual({ theme: 'light' })
    // The text it expected went to a private file beside the settings, gone afterwards.
    expect([...files.keys()].some(p => p.includes('.cc-focusdeck.expect-'))).toBe(false)
  })

  test('on Windows the tools are looked up with where and the file is written directly', async ($, on) => {
    const { runs, writes } = engineBeneath(on, { settings: {}, config: null, tools: ['npx', 'clip'], windows: true })
    await $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
    const menu = await open($)
    expect(runs.some(r => r.argv[0] === 'cmd' && r.argv[3] === 'where')).toBe(true)
    await menu.press({ key: 'statusline-install' })
    expect(writes.map(w => w.path)).toContain(SETTINGS)
    expect(runs.some(r => r.argv[2]?.includes('cat > "$tmp"'))).toBe(false)
    expect(runs.some(r => r.argv[0] === 'cmd' && r.argv[3] === 'move')).toBe(true)
  })
})
