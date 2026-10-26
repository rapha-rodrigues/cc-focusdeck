import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  addLine,
  addWidget,
  backupName,
  backupStamp,
  CATALOG,
  commandAdapter,
  configKey,
  dryRunArgv,
  dryRunVerdict,
  isBackupName,
  isKnownType,
  MANIFEST_IDS,
  modelName,
  moveWidget,
  normalizeColorInput,
  parseAnsi,
  parseConfig,
  previewLines,
  removeLine,
  removeWidget,
  sameConfigIgnoringUpdateMessage,
  sampleStatusJson,
  serialize,
  setWidgetField,
  stripAnsi,
  swatchOf,
  validate,
  versionAtLeast,
  withDiskUpdateMessage,
  type Config,
} from '../hooks/lib/ccsl-editor'
import { STARTER_CONFIG } from '../hooks/lib/ccstatusline'

const PLUGIN = 'cc-focusdeck'
const HOME = '/home/someone'
const SETTINGS = `${HOME}/.claude/settings.json`
const CONFIG = `${HOME}/.config/ccstatusline/settings.json`

// A config as the configurator leaves one: fields the editor never touches
// at the top and inside widgets, an id ccstatusline does not know, and the
// update message it rewrites on its own.
const SAMPLE: Config = {
  version: 4,
  lines: [
    [
      { id: 'model', type: 'model', color: 'black', backgroundColor: 'bgBrightCyan', bold: true, rawValue: true },
      { id: 'ctx', type: 'context-bar', color: 'ansi256:235', metadata: { display: 'progress-short' } },
    ],
    [{ id: 'branch', type: 'git-branch' }],
    [{ id: 'future', type: 'some-future-widget' }],
  ],
  flexMode: 'full-minus-40',
  compactThreshold: 60,
  defaultPadding: ' ',
  powerline: { enabled: true, separators: [''], theme: 'nord' },
  updatemessage: { seen: 1 },
}
const sample = () => JSON.parse(JSON.stringify(SAMPLE)) as Config

describe('ccstatusline editor, pure', () => {
  test('parses what it can edit and names what it cannot', () => {
    expect(parseConfig(JSON.stringify(SAMPLE))).toMatchObject({ ok: true })
    expect(parseConfig('{not json')).toEqual({ ok: false, reason: 'invalid-json' })
    expect(parseConfig('{"version":4}')).toEqual({ ok: false, reason: 'no-lines' })
    expect(parseConfig('[]')).toEqual({ ok: false, reason: 'no-lines' })
    expect(parseConfig('{"version":3,"lines":[[]]}')).toEqual({ ok: false, reason: 'old-version' })
    expect(parseConfig('{"lines":[[]]}')).toEqual({ ok: false, reason: 'old-version' })
  })

  test('the local check refuses what ccstatusline would', () => {
    expect(validate(sample())).toEqual([])
    expect(validate({ ...sample(), lines: [[], [], [], []] })).toContain('at most 3 lines')
    expect(validate({ ...sample(), lines: [] })).toContain('at least one line')
    expect(validate({ ...sample(), lines: [[{ id: 'a', type: 'model', color: 'purple' }]] })).toContain('line 1, widget 1: color purple')
    expect(validate({ ...sample(), lines: [[{ id: 'a', type: 'model', backgroundColor: 'red' }]] })).toContain('line 1, widget 1: background red')
    expect(validate({ ...sample(), lines: [[{ id: 'a', type: 'model', color: 'hex:1A2B3C', backgroundColor: 'ansi256:17' }]] })).toEqual([])
    expect(validate({ ...sample(), lines: [[{ id: 'a', type: 'model' }], [{ id: 'a', type: 'git-branch' }]] })).toContain('line 2, widget 1: duplicate id a')
    expect(validate({ ...sample(), powerline: { theme: 'neon' } })).toContain('powerline theme neon')
    expect(validate({ ...sample(), compactThreshold: 0 })).toContain('compact threshold out of 1..99')
    expect(validate({ ...sample(), flexMode: 'wide' })).toContain('flex mode wide')
  })

  test('draft operations return new objects and keep the bounds', () => {
    const c = sample()
    const added = addWidget(c, 0, 'git-sha')
    expect(added).not.toBe(c)
    expect(c.lines[0]).toHaveLength(2)
    expect(added.lines[0]).toHaveLength(3)
    expect(added.lines[0]![2]!.type).toBe('git-sha')
    expect(added.lines[0]![2]!.id).toMatch(/^cc-[a-z0-9]{6}$/)
    expect(added.lines[1]).toBe(c.lines[1])
    expect(moveWidget(c, 0, 1, -1).lines[0]!.map(w => w.id)).toEqual(['ctx', 'model'])
    expect(moveWidget(c, 0, 0, -1)).toBe(c)
    expect(moveWidget(c, 0, 1, 1)).toBe(c)
    expect(removeWidget(c, 0, 0).lines[0]!.map(w => w.id)).toEqual(['ctx'])
    expect(removeLine(c, 1)).toBe(c)
    expect(removeLine({ ...c, lines: [[], []] }, 1).lines).toHaveLength(1)
    expect(removeLine({ ...c, lines: [[]] }, 0).lines).toHaveLength(1)
    expect(addLine(c)).toBe(c)
    expect(addLine({ ...c, lines: [[]] }).lines).toHaveLength(2)
    const colored = setWidgetField(c, 0, 0, 'color', 'brightRed')
    expect(colored.lines[0]![0]!.color).toBe('brightRed')
    expect(setWidgetField(colored, 0, 0, 'color', undefined).lines[0]![0]).not.toHaveProperty('color')
    expect(setWidgetField(c, 0, 1, 'bold', true).lines[0]![1]!.metadata).toEqual({ display: 'progress-short' })
  })

  test('the adapter recognizes the commands it can run itself and nothing else', () => {
    expect(commandAdapter('npx -y ccstatusline@latest')).toEqual({ argv: ['npx', '-y', 'ccstatusline@latest'], configPath: null, label: 'npx -y ccstatusline@latest' })
    expect(commandAdapter('npx ccstatusline')?.argv).toEqual(['npx', 'ccstatusline'])
    expect(commandAdapter('bunx ccstatusline@2.2.32')?.argv).toEqual(['bunx', 'ccstatusline@2.2.32'])
    expect(commandAdapter('ccstatusline')?.argv).toEqual(['ccstatusline'])
    expect(commandAdapter('/usr/local/bin/ccstatusline --config /tmp/x.json')).toEqual({ argv: ['/usr/local/bin/ccstatusline'], configPath: '/tmp/x.json', label: '/usr/local/bin/ccstatusline' })
    expect(commandAdapter('sh -c "npx ccstatusline"')).toBe(null)
    expect(commandAdapter('npx ccstatusline | tee ~/log')).toBe(null)
    expect(commandAdapter('npx -y ccstatusline@latest --hook')).toBe(null)
    expect(commandAdapter('npx -y ccstatusline@latest --config')).toBe(null)
    expect(commandAdapter('npx other-status')).toBe(null)
    expect(commandAdapter('python3 ~/.claude/statusline.py')).toBe(null)
    expect(dryRunArgv(commandAdapter('ccstatusline')!, '/c.json')).toEqual(['ccstatusline', '--config', '/c.json'])
  })

  test('the dry run verdict reads the exit code, stderr and the drawn line', () => {
    expect(dryRunVerdict(1, '', 'boom\nmore')).toEqual({ ok: false, reason: 'boom' })
    const defaults = dryRunVerdict(0, 'Opus', 'Failed to parse settings, using defaults (file left unchanged)')
    expect(defaults.ok).toBe(false)
    expect(defaults.ok ? '' : defaults.reason).toMatch(/used its defaults/)
    const invalid = dryRunVerdict(0, '\x1b[33m⚠ invalid config\x1b[0m', '')
    expect(invalid.ok).toBe(false)
    expect(invalid.ok ? '' : invalid.reason).toMatch(/invalid config/)
    expect(dryRunVerdict(0, '\x1b[1mOpus 5.5\x1b[0m \x1b]8;;https://x\x07main\x1b]8;;\x07\n', '')).toMatchObject({ ok: true, preview: 'Opus 5.5 main' })
    expect(stripAnsi('\x1b[38;5;235m▓\x1b[0m')).toBe('▓')
  })

  test('the colored output parses into segments the pane can draw', () => {
    // 16 colors, bold, a reset, a link whose text stays.
    expect(parseAnsi('\x1b[1m\x1b[30m\x1b[106m Opus \x1b[0m\x1b[96m\x1b[0m \x1b]8;;https://x\x07main\x1b]8;;\x07')).toEqual([
      { text: ' Opus ', bold: true, color: 'black', backgroundColor: 'cyanBright' },
      { text: ' main' },
    ])
    // 256 colors and true color, dim, inverse; 22 drops bold and dim.
    expect(parseAnsi('\x1b[38;5;235;48;5;12mx\x1b[2my\x1b[22;7mz\x1b[38;2;255;0;128mw')).toEqual([
      { text: 'x', color: '#262626', backgroundColor: 'blueBright' },
      { text: 'y', color: '#262626', backgroundColor: 'blueBright', dim: true },
      { text: 'z', color: '#262626', backgroundColor: 'blueBright', inverse: true },
      { text: 'w', color: '#ff0080', backgroundColor: 'blueBright', inverse: true },
    ])
    expect(parseAnsi('plain')).toEqual([{ text: 'plain' }])
    // Colors typed in, in ccstatusline's spellings; swatches for each form.
    expect(normalizeColorInput(' 235 ')).toBe('ansi256:235')
    expect(normalizeColorInput('ANSI256:17')).toBe('ansi256:17')
    expect(normalizeColorInput('#1A2B3C')).toBe('hex:1A2B3C')
    expect(normalizeColorInput('hex:abcdef')).toBe('hex:abcdef')
    for (const bad of ['256', 'ansi256:999', '#12345', 'purple', '']) expect(normalizeColorInput(bad)).toBe(null)
    expect(swatchOf('ansi256:235')).toBe('#262626')
    expect(swatchOf('ansi256:9')).toBe('redBright')
    expect(swatchOf('hex:1A2B3C')).toBe('#1A2B3C')
    expect(swatchOf('bgBrightCyan')).toBe('cyanBright')
    expect(swatchOf('black')).toBe('black')
    expect(previewLines('\x1b[32ma\x1b[0m\n\n \n\x1b[31mb\x1b[0m\n')).toEqual(['\x1b[32ma\x1b[0m', '\x1b[31mb\x1b[0m'])
  })

  test('the update message is ignored in the compare and taken from the disk', () => {
    const a = sample()
    const b = { ...sample(), updatemessage: { seen: 2 } }
    expect(sameConfigIgnoringUpdateMessage(a, b)).toBe(true)
    expect(sameConfigIgnoringUpdateMessage(a, { ...b, compactThreshold: 50 })).toBe(false)
    expect(withDiskUpdateMessage(a, b).updatemessage).toEqual({ seen: 2 })
    expect(withDiskUpdateMessage(a, { ...b, updatemessage: undefined })).not.toHaveProperty('updatemessage')
    expect(withDiskUpdateMessage(a, null)).not.toHaveProperty('updatemessage')
    expect(JSON.parse(serialize({ lines: [[]] }))).toEqual({ lines: [[]], version: 4 })
  })

  test('backups are named by the time and told apart; versions compare by number', () => {
    const name = backupName('/x/settings.json', new Date(2026, 9, 22, 15, 30, 0), 'ab12cd')
    expect(name).toBe('/x/settings.json.cc-focusdeck.bak-20261022-153000-ab12cd')
    expect(isBackupName('settings.json.cc-focusdeck.bak-20261022-153000-ab12cd')).toBe(true)
    expect(isBackupName('settings.json.cc-focusdeck.bak-20261022-153000')).toBe(true)
    expect(isBackupName('settings.json.cc-focusdeck.candidate-ab12cd')).toBe(false)
    expect(backupStamp('settings.json.cc-focusdeck.bak-20261022-153000-ab12cd')).toBe('2026-10-22 15:30:00')
    expect(versionAtLeast('2.2.32', '2.2.32')).toBe(true)
    expect(versionAtLeast('2.2.31', '2.2.32')).toBe(false)
    expect(versionAtLeast('ccstatusline v3.0.0', '2.2.32')).toBe(true)
    expect(versionAtLeast('2.10.0', '2.2.32')).toBe(true)
    expect(versionAtLeast('garbage', '2.2.32')).toBe(false)
  })

  test('the catalog is a subset of the manifest and the sample status has what widgets read', () => {
    for (const entry of CATALOG) expect(isKnownType(entry.type)).toBe(true)
    expect(new Set(MANIFEST_IDS).size).toBe(MANIFEST_IDS.length)
    const status = JSON.parse(sampleStatusJson({ cwd: `${HOME}/p`, modelId: 'claude-fable-5-1' })) as Record<string, unknown>
    expect(status).toMatchObject({ hook_event_name: 'Status', cwd: `${HOME}/p`, workspace: { current_dir: `${HOME}/p` }, model: { id: 'claude-fable-5-1', display_name: 'Fable 5.1' } })
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('gpt-x')).toBe('gpt-x')
    expect(status).toHaveProperty('context_window')
    expect(status).toHaveProperty('rate_limits')
  })
})

// The engine beneath: the settings file, a ccstatusline config (or not),
// tools on PATH, a status line command the editor can or cannot run, and a
// dry run that answers as told. Every file operation is recorded.
type Beneath = {
  settings?: Record<string, unknown>
  config?: string | null
  extraFiles?: Record<string, string>
  tools?: string[]
  windows?: boolean
  version?: string
  dryRun?: 'ok' | 'invalid' | 'defaults' | 'exit1' | 'timeout'
  store?: Record<string, unknown>
}

const pane = {
  component: 'Pane' as const,
  requestId: 'cc-focusdeck',
  props: { title: 'focusdeck', isFocused: true, bodyColumns: 56, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 26 }, view: {} },
}
const hint = { component: 'PromptHint' as const, props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } }
const OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const COMMAND = { type: 'command', command: 'npx -y ccstatusline@latest', padding: 0 }

const engineBeneath = (on: On, opts: Beneath) => {
  const files = new Map<string, string>()
  // Called before each read, and before each process runs.
  const steer: { onRead?: (path: string) => void; onRun?: (argv: string[]) => void } = {}
  files.set(SETTINGS, JSON.stringify(opts.settings ?? { statusLine: COMMAND }, null, 2) + '\n')
  if (opts.config) files.set(CONFIG, opts.config)
  for (const [path, text] of Object.entries(opts.extraFiles ?? {})) files.set(path, text)
  const writes: { path: string; text: string }[] = []
  const runs: { argv: string[]; stdin?: string }[] = []
  const dryRuns: { argv: string[]; stdin?: string; text: string | undefined }[] = []
  const copies: { from: string; to: string }[] = []
  const removed: string[] = []
  const clock = mock.clock(on)
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
  on('fs.list', (_, e) => ({
    value: [...files.keys()]
      .filter(p => p.startsWith(`${e.path}/`) && !p.slice(e.path.length + 1).includes('/'))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: files.get(p)!.length, mtimeMs: 0, isLink: false })),
  }))
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
    const stdin = e.init?.stdin
    runs.push({ argv, stdin })
    steer.onRun?.(argv)
    const script = argv[0] === 'sh' ? (argv[2] ?? '') : ''
    const tool = argv[0] === 'sh' && script.startsWith('command -v') ? argv[4] : argv[0] === 'cmd' && argv[3] === 'where' ? argv[4] : null
    if (tool !== null) return { value: { ...OK, exitCode: (opts.tools ?? ['npx']).includes(tool!) ? 0 : 1 } }
    if (script.includes('cat > "$tmp"')) {
      // The file must still be what the editor last read, or it stays as it is.
      const expect = argv[6]
      if (expect !== undefined) {
        const now = files.get(argv[4]!)
        const changed = expect === '-' ? now !== undefined : now !== files.get(expect)
        if (expect !== '-') files.delete(expect)
        if (changed) return { value: { ...OK, exitCode: 76 } }
      }
      files.set(argv[4]!, stdin ?? '')
      writes.push({ path: argv[4]!, text: stdin ?? '' })
      return { value: OK }
    }
    if (script === 'umask 077 && cat > "$1"') {
      files.set(argv[4]!, stdin ?? '')
      writes.push({ path: argv[4]!, text: stdin ?? '' })
      return { value: OK }
    }
    if (script.includes('cp -p')) {
      copies.push({ from: argv[4]!, to: argv[5]! })
      files.set(argv[5]!, files.get(argv[4]!) ?? '')
      return { value: OK }
    }
    if (argv[0] === 'rm') {
      removed.push(argv[3]!)
      files.delete(argv[3]!)
      return { value: OK }
    }
    if (argv[0] === 'cmd' && argv[3] === 'move') {
      files.set(argv[6]!, files.get(argv[5]!) ?? '')
      files.delete(argv[5]!)
      writes.push({ path: argv[6]!, text: files.get(argv[6]!)! })
      return { value: OK }
    }
    if (argv[0] === 'cmd' && argv[3] === 'copy') {
      copies.push({ from: argv[5]!, to: argv[6]! })
      files.set(argv[6]!, files.get(argv[5]!) ?? '')
      return { value: OK }
    }
    if (argv[0] === 'cmd' && argv[3] === 'del') {
      removed.push(argv[5]!)
      files.delete(argv[5]!)
      return { value: OK }
    }
    if (argv.includes('--version')) return { value: { ...OK, stdout: `${opts.version ?? '2.2.32'}\n` } }
    if (argv.includes('--config')) {
      const candidate = argv[argv.indexOf('--config') + 1]!
      dryRuns.push({ argv, stdin, text: files.get(candidate) })
      const mode = opts.dryRun ?? 'ok'
      if (mode === 'timeout') throw new Error('timed out after 20000 ms')
      if (mode === 'exit1') return { value: { ...OK, exitCode: 1, stderr: 'boom' } }
      if (mode === 'defaults') return { value: { ...OK, stderr: 'Failed to parse settings, using defaults (file left unchanged)\n' } }
      if (mode === 'invalid') return { value: { ...OK, stdout: '\x1b[33m⚠ invalid config\x1b[0m\n' } }
      return { value: { ...OK, stdout: '\x1b[1mOpus 5.5\x1b[0m | ctx 12%\n\x1b[32mmain\x1b[0m\n' } }
    }
    return { value: OK }
  })
  return { files, writes, runs, dryRuns, copies, removed, steer, clock }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = async ($: any) => {
  const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
  const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
  await corner.press({ key: 'focusdeck-toggle' })
  await menu.press({ key: 'tab-settings' })
  await menu.press({ key: 'settings-statusline' })
  await menu.press({ key: 'statusline-edit' })
  return menu
}
const start = ($: { session: { start: (e: { cwd: string; surface: 'terminal'; isInteractive: boolean }) => Promise<unknown> } }) =>
  $.session.start({ cwd: `${HOME}/p`, surface: 'terminal', isInteractive: true })
const parsed = (files: Map<string, string>) => JSON.parse(files.get(CONFIG)!) as Config

describe('ccstatusline editor page', () => {
  test('opens from the Status line page on the file as it is and edits the draft only', async ($, on) => {
    const { files } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /~\/\.config\/ccstatusline\/settings\.json/ })).toBeDefined()
    for (const key of ['ccsl-line:0', 'ccsl-line:1', 'ccsl-line:2', 'ccsl-save', 'ccsl-revert', 'ccsl-add', 'ccsl-powerline', 'ccsl-layout', 'ccsl-more']) expect(await menu.find({ key })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-add-line' })).toBeUndefined()
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/1\. Model/)
    expect((await menu.find({ key: 'ccsl-w:1' }))?.text).toMatch(/2\. Context bar/)
    expect((await menu.find({ key: 'ccsl-save' }))?.text).toMatch(/Saved/)
    // An id ccstatusline does not know is kept and marked.
    await menu.press({ key: 'ccsl-line:2' })
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/some-future-widget \?/)
    // Choosing a widget shows its actions; a move changes the draft, not the file.
    await menu.press({ key: 'ccsl-line:0' })
    expect(await menu.find({ key: 'ccsl-left' })).toBeUndefined()
    await menu.press({ key: 'ccsl-w:1' })
    await menu.press({ key: 'ccsl-left' })
    await menu.press({ key: 'ccsl-widget-back' })
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/1\. Context bar/)
    expect((await menu.find({ key: 'ccsl-save' }))?.text).toMatch(/^Save$/)
    expect(files.get(CONFIG)).toBe(serialize(SAMPLE))
  })

  test('the file edited is the one the command names with --config, a ~ expanded', async ($, on) => {
    const CUSTOM = `${HOME}/custom/sl.json`
    const { files, dryRuns } = engineBeneath(on, {
      settings: { statusLine: { type: 'command', command: 'npx -y ccstatusline@latest --config ~/custom/sl.json', padding: 0 } },
      config: null,
      extraFiles: { [CUSTOM]: serialize(SAMPLE) },
    })
    await start($)
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /~\/custom\/sl\.json/ })).toBeDefined()
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/1\. Model/)
    await menu.press({ key: 'ccsl-w:1' })
    await menu.press({ key: 'ccsl-left' })
    await menu.press({ key: 'ccsl-widget-back' })
    await menu.press({ key: 'ccsl-save' })
    expect(dryRuns).toHaveLength(1)
    expect(dryRuns[0]!.argv[4]).toMatch(/^\/home\/someone\/custom\/sl\.json\.cc-focusdeck\.candidate-/)
    expect(files.get(CUSTOM)).toBe(dryRuns[0]!.text)
    expect(files.get(CUSTOM)).not.toBe(serialize(SAMPLE))
    expect(files.has(CONFIG)).toBe(false)
  })

  test('Save dry-runs the candidate through the adapter, backs the file up, replaces it in one step and keeps what it does not edit', async ($, on) => {
    const { files, dryRuns, copies, removed, runs } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:1' })
    await menu.press({ key: 'ccsl-left' })
    await menu.press({ key: 'ccsl-widget-back' })
    await menu.press({ key: 'ccsl-save' })
    // The dry run: the adapter's argv plus --config, a private candidate, a sample status on stdin.
    expect(dryRuns).toHaveLength(1)
    const [dry] = dryRuns
    expect(dry!.argv.slice(0, 4)).toEqual(['npx', '-y', 'ccstatusline@latest', '--config'])
    const candidate = dry!.argv[4]!
    expect(candidate).toMatch(/settings\.json\.cc-focusdeck\.candidate-[a-z0-9]{6}$/)
    expect(runs.some(r => r.argv[0] === 'sh' && r.argv[2] === 'umask 077 && cat > "$1"' && r.argv[4] === candidate)).toBe(true)
    expect((JSON.parse(dry!.stdin!) as { hook_event_name: string }).hook_event_name).toBe('Status')
    expect(removed).toContain(candidate)
    // The bytes the dry run saw are the bytes written; the backup came from the file before.
    expect(files.get(CONFIG)).toBe(dry!.text)
    expect(copies).toHaveLength(1)
    expect(copies[0]!.from).toBe(CONFIG)
    expect(isBackupName(copies[0]!.to)).toBe(true)
    expect(files.get(copies[0]!.to)).toBe(serialize(SAMPLE))
    const saved = parsed(files)
    expect(saved.lines[0]!.map(w => w.type)).toEqual(['context-bar', 'model'])
    expect(saved.lines[0]![0]!.metadata).toEqual({ display: 'progress-short' })
    expect(saved.defaultPadding).toBe(' ')
    expect(saved.powerline).toEqual({ enabled: true, separators: [''], theme: 'nord' })
    expect(saved.updatemessage).toEqual({ seen: 1 })
    expect(saved.lines[2]![0]!.type).toBe('some-future-widget')
    // The page: saved, the preview as drawn, ANSI stripped.
    expect(await menu.find({ type: 'Text', text: /Saved: the status line/ })).toBeDefined()
    expect(await menu.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    expect(await menu.find({ type: 'Text', text: /ctx 12%/ })).toBeDefined()
    expect((await menu.find({ key: 'ccsl-save' }))?.text).toMatch(/Saved/)
  })

  test('the Preview chip draws the draft through the command without writing, with the session\'s folder in the status', async ($, on) => {
    const { files, dryRuns, copies, writes } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /Nothing is saved/ })).toBeDefined()
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-remove' })
    await menu.press({ key: 'ccsl-preview-run' })
    expect(dryRuns).toHaveLength(1)
    const status = JSON.parse(dryRuns[0]!.stdin!) as { cwd: string; workspace: { current_dir: string } }
    expect(status.cwd).toBe(`${HOME}/p`)
    expect(status.workspace.current_dir).toBe(`${HOME}/p`)
    expect((JSON.parse(dryRuns[0]!.text!) as Config).lines[0]!.map(w => w.type)).toEqual(['context-bar'])
    expect(await menu.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    expect(await menu.find({ type: 'Text', text: /Preview of the draft; nothing saved/ })).toBeDefined()
    expect(files.get(CONFIG)).toBe(serialize(SAMPLE))
    expect(copies).toHaveLength(0)
    expect(writes.filter(w => w.path === CONFIG)).toHaveLength(0)
    expect((await menu.find({ key: 'ccsl-save' }))?.text).toMatch(/^Save$/)
  })

  test('a change on a sub-page redraws the preview a moment later, once for a run of changes', async ($, on) => {
    const { dryRuns, files, clock } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-bold' })
    await menu.press({ key: 'ccsl-raw' })
    // Due, not run yet: the widget page says so.
    expect(dryRuns).toHaveLength(0)
    expect(await menu.find({ type: 'Text', text: /updating/ })).toBeDefined()
    await clock.advance(599)
    expect(dryRuns).toHaveLength(0)
    await clock.advance(1)
    await clock.settle()
    expect(dryRuns).toHaveLength(1)
    expect((JSON.parse(dryRuns[0]!.text!) as Config).lines[0]![0]).not.toHaveProperty('bold')
    expect(await menu.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    expect(await menu.find({ type: 'Text', text: /updating/ })).toBeUndefined()
    // Nothing written.
    expect(files.get(CONFIG)).toBe(serialize(SAMPLE))
    // The color page shows it too, and a pick there schedules another.
    await menu.press({ key: 'ccsl-color' })
    expect(await menu.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    await menu.press({ key: 'ccsl-pal:brightRed' })
    expect(await menu.find({ type: 'Text', text: /updating/ })).toBeDefined()
    await clock.advance(600)
    await clock.settle()
    expect(dryRuns).toHaveLength(2)
    expect((JSON.parse(dryRuns[1]!.text!) as Config).lines[0]![0]!.color).toBe('brightRed')
  })

  test('the preview kept from a previous session comes back when the file is the config it was drawn from', async ($, on) => {
    const kept = { key: configKey(JSON.parse(serialize(SAMPLE)) as Config), lines: ['\x1b[32mkept line\x1b[0m'] }
    const { dryRuns } = engineBeneath(on, { config: serialize(SAMPLE), store: { ccslPreview: kept } })
    await start($)
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /kept line/ })).toBeDefined()
    expect(dryRuns).toHaveLength(0)
    await menu.unmount()
  })

  test('a kept preview of another config is not shown; one is drawn on opening instead', async ($, on) => {
    const kept = { key: configKey({ ...(JSON.parse(serialize(SAMPLE)) as Config), compactThreshold: 50 }), lines: ['kept line'] }
    const { dryRuns, clock } = engineBeneath(on, { config: serialize(SAMPLE), store: { ccslPreview: kept } })
    await start($)
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /kept line/ })).toBeUndefined()
    expect(await menu.find({ type: 'Text', text: /Nothing is saved/ })).toBeDefined()
    expect((await menu.find({ key: 'ccsl-preview-run' }))?.text).toMatch(/updating/)
    await clock.advance(600)
    await clock.settle()
    expect(dryRuns).toHaveLength(1)
    expect(await menu.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    // The sub-pages carry it from the start.
    await menu.press({ key: 'ccsl-powerline' })
    expect(await menu.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  })

  test('an update message ccstatusline rewrote meanwhile does not block the save and is carried from the disk', async ($, on) => {
    const { files, steer } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    // ccstatusline rewrote the message once, between the editor's read and its save.
    let once = true
    steer.onRead = path => {
      if (path === CONFIG && once) {
        once = false
        files.set(CONFIG, serialize({ ...sample(), updatemessage: { seen: 2 } }))
      }
    }
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-bold' })
    await menu.press({ key: 'ccsl-widget-back' })
    await menu.press({ key: 'ccsl-save' })
    expect(await menu.find({ type: 'Text', text: /Saved: the status line/ })).toBeDefined()
    const saved = parsed(files)
    expect(saved.updatemessage).toEqual({ seen: 2 })
    expect(saved.lines[0]![0]).not.toHaveProperty('bold')
  })

  test('an update message rewritten after the candidate was built is kept: Save refuses instead of writing the older one back', async ($, on) => {
    const { files, steer } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-bold' })
    await menu.press({ key: 'ccsl-widget-back' })
    // ccstatusline rewrites its message while the editor backs the file up: the
    // candidate already carries seen: 1, and the last read sees only a message change.
    const outside = serialize({ ...sample(), updatemessage: { seen: 2 } })
    steer.onRun = argv => {
      if (argv[2] === 'umask 077 && cp -p -- "$1" "$2"') files.set(CONFIG, outside)
    }
    await menu.press({ key: 'ccsl-save' })
    expect(await menu.find({ type: 'Text', text: /changed outside/ })).toBeDefined()
    expect(files.get(CONFIG)).toBe(outside)
  })

  // A dry run that fails blocks the write and says why.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocked = async ($: any, on: On, mode: Beneath['dryRun'], reason: RegExp) => {
    const { files, copies } = engineBeneath(on, { config: serialize(SAMPLE), dryRun: mode })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-remove' })
    await menu.press({ key: 'ccsl-save' })
    expect(await menu.find({ type: 'Text', text: /Not saved/ })).toBeDefined()
    expect(await menu.find({ type: 'Text', text: reason })).toBeDefined()
    expect(files.get(CONFIG)).toBe(serialize(SAMPLE))
    expect(copies).toHaveLength(0)
  }
  test('a dry run that draws "invalid config" blocks the write', ($, on) => blocked($, on, 'invalid', /invalid config/))
  test('a dry run that fell back to defaults blocks the write', ($, on) => blocked($, on, 'defaults', /used its defaults/))
  test('a dry run that exits non-zero blocks the write with its stderr', ($, on) => blocked($, on, 'exit1', /boom/))

  test('when the preview cannot run, Save refuses and More offers Save without preview', async ($, on) => {
    const { files, dryRuns } = engineBeneath(on, { config: serialize(SAMPLE), dryRun: 'timeout' })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-remove' })
    await menu.press({ key: 'ccsl-save' })
    expect(await menu.find({ type: 'Text', text: /No preview/ })).toBeDefined()
    expect(files.get(CONFIG)).toBe(serialize(SAMPLE))
    await menu.press({ key: 'ccsl-more' })
    await menu.press({ key: 'ccsl-save-blind' })
    expect(await menu.find({ type: 'Text', text: /without a preview/ })).toBeDefined()
    expect(dryRuns).toHaveLength(1)
    expect(parsed(files).lines[0]!.map(w => w.type)).toEqual(['context-bar'])
  })

  test('a file changed outside the editor is not written over', async ($, on) => {
    const { files, steer, copies } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    const outside = serialize({ ...sample(), lines: [[{ id: 'x', type: 'git-sha' }]] })
    steer.onRead = path => {
      if (path === CONFIG) files.set(CONFIG, outside)
    }
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-remove' })
    await menu.press({ key: 'ccsl-save' })
    expect(await menu.find({ type: 'Text', text: /changed outside/ })).toBeDefined()
    expect(files.get(CONFIG)).toBe(outside)
    expect(copies).toHaveLength(0)
    // Revert reloads the file as it is now.
    await menu.press({ key: 'ccsl-revert' })
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/Git SHA/)
  })

  test('a status line command the editor cannot run gets no dry run; Save without preview still writes', async ($, on) => {
    const { files, dryRuns } = engineBeneath(on, { settings: { statusLine: { type: 'command', command: 'sh -c "npx ccstatusline | tee ~/sl.log"' } }, config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-raw' })
    await menu.press({ key: 'ccsl-widget-back' })
    await menu.press({ key: 'ccsl-save' })
    expect(await menu.find({ type: 'Text', text: /not one the editor can run/ })).toBeDefined()
    expect(files.get(CONFIG)).toBe(serialize(SAMPLE))
    await menu.press({ key: 'ccsl-more' })
    expect(await menu.find({ type: 'Text', text: /not one the editor can run for a preview/ })).toBeDefined()
    await menu.press({ key: 'ccsl-save-blind' })
    expect(dryRuns).toHaveLength(0)
    expect(parsed(files).lines[0]![0]).not.toHaveProperty('rawValue')
  })

  test('with no config file the editor is reduced; Reset to starter and Save create it, with no backup to make', async ($, on) => {
    const { files, copies, dryRuns } = engineBeneath(on, { config: null })
    await start($)
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /No ccstatusline config file/ })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-save' })).toBeUndefined()
    await menu.press({ key: 'ccsl-more' })
    expect(await menu.find({ type: 'Text', text: /No backups yet/ })).toBeDefined()
    await menu.press({ key: 'ccsl-reset' })
    expect(await menu.find({ type: 'Text', text: /starter layout is the draft/ })).toBeDefined()
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/Model/)
    await menu.press({ key: 'ccsl-save' })
    expect(dryRuns).toHaveLength(1)
    expect(copies).toHaveLength(0)
    expect(parsed(files).lines.map(l => l.map(w => w.type))).toEqual(STARTER_CONFIG.lines.map(l => l.map(w => w.type)))
    expect(await menu.find({ type: 'Text', text: /Saved: the status line/ })).toBeDefined()
  })

  test('a config that does not parse is reduced too, and a backup restores it after backing the broken file up', async ($, on) => {
    const backupPath = `${CONFIG}.cc-focusdeck.bak-20260101-120000-abc123`
    const good = serialize({ ...sample(), lines: [[{ id: 'b', type: 'git-branch' }]] })
    const { files, copies } = engineBeneath(on, { config: '{broken', extraFiles: { [backupPath]: good, [`${CONFIG}.cc-focusdeck.candidate-zzz`]: '{}' } })
    await start($)
    const menu = await open($)
    expect(await menu.find({ type: 'Text', text: /does not parse/ })).toBeDefined()
    await menu.press({ key: 'ccsl-more' })
    const row = await menu.find({ key: `ccsl-restore:settings.json.cc-focusdeck.bak-20260101-120000-abc123` })
    expect(row?.text).toMatch(/2026-01-01 12:00:00/)
    expect(await menu.find({ key: 'ccsl-restore:settings.json.cc-focusdeck.candidate-zzz' })).toBeUndefined()
    await menu.press({ key: `ccsl-restore:settings.json.cc-focusdeck.bak-20260101-120000-abc123` })
    expect(copies).toHaveLength(1)
    expect(files.get(copies[0]!.to)).toBe('{broken')
    expect(files.get(CONFIG)).toBe(good)
    expect(await menu.find({ type: 'Text', text: /Restored 2026-01-01/ })).toBeDefined()
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/Git branch/)
  })

  test('Add widget offers the catalog from 2.2.32 on, and before that only the types the file holds', async ($, on) => {
    const { runs } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-add' })
    expect(runs.some(r => r.argv.join(' ') === 'npx -y ccstatusline@latest --version')).toBe(true)
    expect(await menu.find({ type: 'Text', text: /ccstatusline 2\.2\.32/ })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-add:model' })).toBeDefined()
    await menu.press({ key: 'ccsl-cat:Git' })
    expect(await menu.find({ key: 'ccsl-add:model' })).toBeUndefined()
    await menu.press({ key: 'ccsl-add:git-sha' })
    expect((await menu.find({ key: 'ccsl-w:2' }))?.text).toMatch(/3\. Git SHA/)
  })

  test('an older ccstatusline gates the catalog to the file\'s own types and the separators', async ($, on) => {
    engineBeneath(on, { config: serialize(SAMPLE), version: 'ccstatusline 2.1.9' })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-add' })
    expect(await menu.find({ type: 'Text', text: /older than 2\.2\.32/ })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-cat:Git' })).toBeUndefined()
    for (const key of ['ccsl-add:model', 'ccsl-add:context-bar', 'ccsl-add:git-branch', 'ccsl-add:some-future-widget', 'ccsl-add:separator', 'ccsl-add:flex-separator']) expect(await menu.find({ key })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-add:git-sha' })).toBeUndefined()
  })

  test('the widget page moves, flags and colors a widget; Powerline and Layout change the draft', async ($, on) => {
    const { files } = engineBeneath(on, { config: serialize(SAMPLE) })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:0' })
    expect(await menu.find({ type: 'Text', text: /Model · line 1 · 1 of 2/ })).toBeDefined()
    // The first widget has nowhere to move left.
    expect(await menu.find({ key: 'ccsl-left' })).toBeUndefined()
    expect(await menu.find({ key: 'ccsl-right' })).toBeDefined()
    await menu.press({ key: 'ccsl-color' })
    expect(await menu.find({ type: 'Text', text: /Color of Model/ })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-pal:brightRed' })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-pal:bgBrightRed' })).toBeUndefined()
    await menu.press({ key: 'ccsl-pal:brightRed' })
    // The page stays open for the next try; the pick shows at once.
    expect(await menu.find({ type: 'Text', text: /Now: .*brightRed/ })).toBeDefined()
    await menu.press({ key: 'ccsl-color-back' })
    expect((await menu.find({ key: 'ccsl-color' }))?.text).toMatch(/brightRed/)
    await menu.press({ key: 'ccsl-bg' })
    expect(await menu.find({ key: 'ccsl-pal:bgBlue' })).toBeDefined()
    await menu.press({ key: 'ccsl-pal:none' })
    // A color outside the palette, typed in; a bad one changes nothing.
    await menu.input({ key: 'ccsl-color-other', text: '#1a2b3c' })
    expect(await menu.find({ type: 'Text', text: /Now: .*hex:1a2b3c/ })).toBeDefined()
    await menu.input({ key: 'ccsl-color-other', text: 'ansi256:999' })
    expect(await menu.find({ type: 'Text', text: /Now: .*hex:1a2b3c/ })).toBeDefined()
    await menu.input({ key: 'ccsl-color-other', text: '17' })
    expect(await menu.find({ type: 'Text', text: /Now: .*ansi256:17/ })).toBeDefined()
    await menu.press({ key: 'ccsl-pal:none' })
    await menu.press({ key: 'ccsl-color-back' })
    expect((await menu.find({ key: 'ccsl-bg' }))?.text).toMatch(/none/)
    await menu.press({ key: 'ccsl-widget-back' })
    expect((await menu.find({ key: 'ccsl-w:0' }))?.text).toMatch(/brightRed\/·/)
    // A color outside the palette is shown as kept.
    await menu.press({ key: 'ccsl-w:1' })
    await menu.press({ key: 'ccsl-color' })
    expect(await menu.find({ type: 'Text', text: /outside the palette/ })).toBeDefined()
    await menu.press({ key: 'ccsl-color-back' })
    await menu.press({ key: 'ccsl-widget-back' })

    await menu.press({ key: 'ccsl-powerline' })
    await menu.press({ key: 'ccsl-theme:dracula' })
    await menu.press({ key: 'ccsl-pl-align' })
    await menu.press({ key: 'ccsl-pl-back' })
    await menu.press({ key: 'ccsl-layout' })
    await menu.press({ key: 'ccsl-flex:full' })
    await menu.press({ key: 'ccsl-compact:40' })
    await menu.press({ key: 'ccsl-minimalist' })
    await menu.press({ key: 'ccsl-layout-back' })
    await menu.press({ key: 'ccsl-save' })
    const saved = parsed(files)
    expect(saved.lines[0]![0]).toMatchObject({ color: 'brightRed', bold: true })
    expect(saved.lines[0]![0]).not.toHaveProperty('backgroundColor')
    expect(saved.lines[0]![1]!.color).toBe('ansi256:235')
    expect(saved.powerline).toEqual({ enabled: true, separators: [''], theme: 'dracula', autoAlign: true })
    expect(saved).toMatchObject({ flexMode: 'full', compactThreshold: 40, minimalistMode: true })
  })

  test('lines come and go within three, and only an empty line goes', async ($, on) => {
    engineBeneath(on, { config: serialize({ ...sample(), lines: [[{ id: 'm', type: 'model' }]] }) })
    await start($)
    const menu = await open($)
    expect(await menu.find({ key: 'ccsl-remove-line' })).toBeUndefined()
    await menu.press({ key: 'ccsl-add-line' })
    expect(await menu.find({ key: 'ccsl-line:1' })).toBeDefined()
    expect(await menu.find({ type: 'Text', text: /empty line/ })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-remove-line' })).toBeDefined()
    await menu.press({ key: 'ccsl-add-line' })
    expect(await menu.find({ key: 'ccsl-line:2' })).toBeDefined()
    expect(await menu.find({ key: 'ccsl-add-line' })).toBeUndefined()
    await menu.press({ key: 'ccsl-remove-line' })
    expect(await menu.find({ key: 'ccsl-line:2' })).toBeUndefined()
    await menu.press({ key: 'ccsl-line:0' })
    expect(await menu.find({ key: 'ccsl-remove-line' })).toBeUndefined()
  })

  test('a long line draws only the rows that fit the pane', async ($, on) => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, type: 'custom-text' }))
    engineBeneath(on, { config: serialize({ ...sample(), lines: [many] }) })
    await start($)
    const menu = await open($)
    const drawn = (await menu.findAll({ type: 'Button' })).filter((el: { key: string | undefined }) => el.key?.startsWith('ccsl-w:'))
    expect(drawn.length).toBe(26 - (2 + 3 + 1 + 3 + 3 + 3))
    expect(await menu.find({ key: 'ccsl-add' })).toBeDefined()
  })

  test('on Windows the candidate is written directly and the file is replaced through move', async ($, on) => {
    const { files, runs, writes, copies, removed } = engineBeneath(on, { config: serialize(SAMPLE), windows: true })
    await start($)
    const menu = await open($)
    await menu.press({ key: 'ccsl-w:0' })
    await menu.press({ key: 'ccsl-remove' })
    await menu.press({ key: 'ccsl-save' })
    expect(writes.some(w => /candidate-/.test(w.path))).toBe(true)
    expect(removed.some(p => /candidate-/.test(p))).toBe(true)
    expect(runs.some(r => r.argv[0] === 'sh')).toBe(false)
    expect(runs.some(r => r.argv[0] === 'cmd' && r.argv[3] === 'move' && r.argv[6] === CONFIG)).toBe(true)
    expect(copies).toHaveLength(1)
    expect(parsed(files).lines[0]!.map(w => w.type)).toEqual(['context-bar'])
    expect(await menu.find({ type: 'Text', text: /Saved: the status line/ })).toBeDefined()
  })
})
